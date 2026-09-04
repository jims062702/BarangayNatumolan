<?php

namespace App\Support;

use App\Models\Resident;
use App\Models\ResidentMergeRecord;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Folds a duplicate resident record into the one the barangay is keeping —
 * and keeps enough of a receipt to undo it.
 *
 * Duplicates happen: a nickname spelled differently a year later, a house
 * visit that re-lists someone already on file. Until they are merged the
 * person's life is split in two — their certificates on one record, their
 * family on the other, and a portal login that shows them neither.
 *
 * But merging is a JUDGEMENT made on incomplete evidence. Two unrelated
 * people really can share a name and a birthday, so the office will
 * eventually get one wrong. Every merge therefore writes a
 * `resident_merges` row holding the exact row ids that changed hands and
 * everything that was overwritten or deleted, so reversing it is a replay
 * rather than a guess.
 *
 * The duplicate itself is never deleted — certificates issued under its
 * number must stay verifiable.
 */
class ResidentMerge
{
    /**
     * Everything in the database that points at a resident, as
     * table => [columns]. Taken from the actual foreign keys rather than
     * memory, because a table missed here would silently strand records on
     * the dead copy.
     *
     * `resident_parents`, `residents.spouse_id`, `users.resident_id` and
     * `households.household_head_id` are deliberately absent — each needs
     * more than a column rewrite and is handled on its own below.
     */
    private const SIMPLE_REFERENCES = [
        'appointments' => ['resident_id'],
        'certificates_clearances' => ['resident_id'],
        'chat_conversations' => ['resident_id'],
        'child_health' => ['child_id'],
        'health_visits' => ['patient_id'],
        'immunization_records' => ['child_id'],
        'lupon_cases' => ['complainant_id'],
        'maternal_health' => ['mother_id'],
        'notifications' => ['resident_id'],
        'office_queue' => ['resident_id'],
        'population_events' => ['resident_id'],
        'referrals' => ['resident_id'],
        'service_requests' => ['resident_id'],
        'vawc_cases' => ['survivor_id'],
    ];

    /**
     * Tables where the keeper may ALREADY hold the row the duplicate is
     * bringing — a unique index across the resident column and a scope
     * column. Moving these blindly fails on that index, so a colliding row is
     * dropped instead of moved: table => [resident column, scope column].
     */
    private const SCOPED_REFERENCES = [
        'resident_sectors' => ['resident_id', 'sector_type'],
        'lupon_case_respondents' => ['resident_id', 'lupon_case_id'],
        'vawc_case_dependents' => ['resident_id', 'vawc_case_id'],
    ];

    /** Fields copied onto the keeper only where the keeper has nothing. */
    private const FILLABLE_GAPS = [
        'middle_name', 'mother_maiden_name', 'suffix', 'gender', 'birthdate',
        'birth_place', 'civil_status', 'occupation', 'contact_number', 'email',
        'household_id', 'zone_purok', 'educational_attainment',
        'length_of_residence_years',
    ];

    /**
     * @return array{record: ResidentMergeRecord, notes: string[], moved: array<string,int>}
     */
    public static function merge(Resident $keeper, Resident $duplicate): array
    {
        $notes = [];
        $moved = [];
        // Everything that would otherwise be destroyed, kept for the undo.
        $restore = ['filled' => [], 'deleted' => [], 'households' => [], 'account' => null, 'duplicate' => []];

        $record = DB::transaction(function () use ($keeper, $duplicate, &$notes, &$moved, &$restore) {
            $restore['duplicate'] = [
                'is_active' => (bool) $duplicate->is_active,
                'spouse_id' => $duplicate->spouse_id,
                'email' => $duplicate->email,
                'remarks' => $duplicate->remarks,
            ];

            foreach (self::SIMPLE_REFERENCES as $table => $columns) {
                foreach ($columns as $column) {
                    // The ids are captured BEFORE the update: afterwards there
                    // is no way to tell which of the keeper's rows arrived.
                    $ids = DB::table($table)->where($column, $duplicate->id)->pluck('id')->all();

                    if ($ids === []) {
                        continue;
                    }

                    DB::table($table)->whereIn('id', $ids)->update([$column => $keeper->id]);
                    $moved[$table][$column] = $ids;
                }
            }

            foreach (self::SCOPED_REFERENCES as $table => [$column, $scope]) {
                self::moveScoped($table, $column, $scope, $keeper, $duplicate, $moved, $restore);
            }

            self::mergeParentLinks($keeper, $duplicate, $moved, $restore);
            self::mergeSpouse($keeper, $duplicate, $notes, $restore);
            self::mergeHouseholdHeadship($keeper, $duplicate, $notes, $restore);
            self::mergePortalAccount($keeper, $duplicate, $notes, $restore);
            self::fillGaps($keeper, $duplicate, $notes, $restore);

            $duplicate->forceFill([
                'is_active' => false,
                'merged_into_id' => $keeper->id,
                'remarks' => trim(($duplicate->remarks ? $duplicate->remarks . ' ' : '')
                    . '[Merged into ' . $keeper->resident_number . ' on '
                    . now()->toDateString() . '.]'),
            ])->save();

            return ResidentMergeRecord::create([
                'keeper_id' => $keeper->id,
                'duplicate_id' => $duplicate->id,
                'moved' => $moved,
                'restore' => $restore,
                'notes' => $notes,
                'merged_by' => auth()->id(),
            ]);
        });

        return ['record' => $record, 'notes' => $notes, 'moved' => self::countMoved($moved)];
    }

    /**
     * Puts everything back where it was.
     *
     * Runs off the receipt written at merge time rather than re-deriving
     * anything, so a record that arrived on the keeper independently AFTER
     * the merge is left alone — only the rows this merge actually moved go
     * home.
     */
    public static function reverse(ResidentMergeRecord $record): array
    {
        $keeper = Resident::findOrFail($record->keeper_id);
        $duplicate = Resident::findOrFail($record->duplicate_id);
        $restore = $record->restore ?? [];

        DB::transaction(function () use ($record, $keeper, $duplicate, $restore) {
            foreach (($record->moved ?? []) as $table => $columns) {
                foreach ($columns as $column => $ids) {
                    if ($ids === []) {
                        continue;
                    }

                    DB::table($table)->whereIn('id', $ids)->update([$column => $duplicate->id]);
                }
            }

            // Rows dropped because the keeper already had an equivalent.
            foreach (($restore['deleted'] ?? []) as $row) {
                $exists = DB::table($row['table'])->where('id', $row['values']['id'] ?? 0)->exists();

                if (!$exists) {
                    DB::table($row['table'])->insert($row['values']);
                }
            }

            foreach (($restore['households'] ?? []) as $house) {
                DB::table('households')->where('id', $house['household_id'])
                    ->update(['household_head_id' => $house['previous_head_id']]);
            }

            // Fields the keeper only has because the duplicate supplied them.
            if ($restore['filled'] ?? []) {
                $keeper->forceFill($restore['filled'])->save();
            }

            if ($account = ($restore['account'] ?? null)) {
                User::where('id', $account['user_id'])->update([
                    'resident_id' => $account['resident_id'],
                    'is_active' => $account['is_active'],
                ]);
            }

            // Anyone re-pointed at the keeper goes back to the duplicate.
            if (($restore['duplicate']['spouse_id'] ?? null)) {
                Resident::where('spouse_id', $keeper->id)
                    ->where('id', $restore['duplicate']['spouse_id'])
                    ->update(['spouse_id' => $duplicate->id]);

                if ($keeper->spouse_id === $restore['duplicate']['spouse_id']) {
                    $keeper->forceFill(['spouse_id' => null])->save();
                }
            }

            $duplicate->forceFill([
                'is_active' => $restore['duplicate']['is_active'] ?? true,
                'spouse_id' => $restore['duplicate']['spouse_id'] ?? null,
                'email' => $restore['duplicate']['email'] ?? null,
                'remarks' => $restore['duplicate']['remarks'] ?? null,
                'merged_into_id' => null,
            ])->save();

            $record->forceFill(['reversed_at' => now(), 'reversed_by' => auth()->id()])->save();
        });

        return ['keeper' => $keeper->fresh(), 'duplicate' => $duplicate->fresh()];
    }

    /** Flattens the id lists into per-table counts, for the message. */
    private static function countMoved(array $moved): array
    {
        $counts = [];

        foreach ($moved as $table => $columns) {
            foreach ($columns as $ids) {
                $counts[$table] = ($counts[$table] ?? 0) + count($ids);
            }
        }

        return $counts;
    }

    /**
     * Parent/child rows carry a unique (child_id, parent_id) pair, so they are
     * rewritten one at a time: a row that would collide with one the keeper
     * already has is dropped, and a row that would make the keeper their own
     * parent is dropped too.
     */
    private static function mergeParentLinks(Resident $keeper, Resident $duplicate, array &$moved, array &$restore): void
    {
        foreach ([['child_id', 'parent_id'], ['parent_id', 'child_id']] as [$mine, $theirs]) {
            $rows = DB::table('resident_parents')->where($mine, $duplicate->id)->get();

            foreach ($rows as $row) {
                $other = $row->$theirs;

                $collides = DB::table('resident_parents')
                    ->where($mine, $keeper->id)
                    ->where($theirs, $other)
                    ->exists();

                if ($other === $keeper->id || $collides) {
                    $restore['deleted'][] = ['table' => 'resident_parents', 'values' => (array) $row];
                    DB::table('resident_parents')->where('id', $row->id)->delete();
                    continue;
                }

                DB::table('resident_parents')->where('id', $row->id)->update([$mine => $keeper->id]);
                $moved['resident_parents'][$mine][] = $row->id;
            }
        }
    }

    /** Marriage is a mutual pointer, so both ends have to be redirected. */
    private static function mergeSpouse(Resident $keeper, Resident $duplicate, array &$notes, array &$restore): void
    {
        // Anyone married to the duplicate is married to the keeper.
        Resident::where('spouse_id', $duplicate->id)
            ->where('id', '!=', $keeper->id)
            ->update(['spouse_id' => $keeper->id]);

        if (!$keeper->spouse_id && $duplicate->spouse_id && $duplicate->spouse_id !== $keeper->id) {
            $keeper->forceFill(['spouse_id' => $duplicate->spouse_id])->save();
            $notes[] = 'Marriage carried over from the duplicate.';
        }

        $duplicate->forceFill(['spouse_id' => null])->save();
    }

    /** A house headed by the duplicate is headed by the keeper. */
    private static function mergeHouseholdHeadship(Resident $keeper, Resident $duplicate, array &$notes, array &$restore): void
    {
        $houses = DB::table('households')->where('household_head_id', $duplicate->id)->pluck('id');

        foreach ($houses as $householdId) {
            $restore['households'][] = [
                'household_id' => $householdId,
                'previous_head_id' => $duplicate->id,
            ];
        }

        /*
         * Deliberately NOT Household::handOverTo().
         *
         * A merge is a correction, not a hand-over: the two records were
         * always one person, and the house never changed hands. Writing an
         * ownership entry here would put a transfer in the history that
         * never happened in the world — and the undo above already restores
         * the previous value, which a history entry would not.
         */
        if ($houses->isNotEmpty()) {
            DB::table('households')->whereIn('id', $houses)->update(['household_head_id' => $keeper->id]);
            $notes[] = $houses->count() . ' household(s) now list ' . $keeper->full_name . ' as owner.';
        }
    }

    /**
     * A person gets one login. If the keeper has none, the duplicate's is
     * moved across so the resident keeps signing in with the address they
     * already know; if both have one, the keeper's stands and the other is
     * switched off rather than deleted, so the trail survives.
     */
    private static function mergePortalAccount(Resident $keeper, Resident $duplicate, array &$notes, array &$restore): void
    {
        $duplicateAccount = User::where('resident_id', $duplicate->id)->first();

        if (!$duplicateAccount) {
            return;
        }

        $restore['account'] = [
            'user_id' => $duplicateAccount->id,
            'resident_id' => $duplicate->id,
            'is_active' => (bool) $duplicateAccount->is_active,
        ];

        $keeperAccount = User::where('resident_id', $keeper->id)->first();

        if (!$keeperAccount) {
            $duplicateAccount->forceFill(['resident_id' => $keeper->id])->save();
            $notes[] = 'Portal login ' . $duplicateAccount->email . ' now signs in to this record.';

            return;
        }

        $duplicateAccount->forceFill(['resident_id' => null, 'is_active' => false])->save();
        $notes[] = 'The duplicate login ' . $duplicateAccount->email
            . ' was disabled — this resident signs in with ' . $keeperAccount->email . '.';
    }

    /** Anything the keeper is missing is taken from the duplicate. */
    private static function fillGaps(Resident $keeper, Resident $duplicate, array &$notes, array &$restore): void
    {
        $filled = [];

        foreach (self::FILLABLE_GAPS as $field) {
            $mine = $keeper->{$field};
            $theirs = $duplicate->{$field};

            if (($mine === null || $mine === '') && $theirs !== null && $theirs !== '') {
                // Email is a login and is unique per resident: it can only be
                // taken once the duplicate has given it up.
                if ($field === 'email') {
                    $duplicate->forceFill(['email' => null])->save();
                }

                // Remember it was empty, so an undo can empty it again.
                $restore['filled'][$field] = $mine;

                $keeper->{$field} = $theirs;
                $filled[] = str_replace('_', ' ', $field);
            }
        }

        if ($filled !== []) {
            $keeper->save();
            $notes[] = 'Filled in from the duplicate: ' . implode(', ', $filled) . '.';
        }
    }

    /**
     * Moves rows guarded by a unique (resident, scope) index. Whatever the
     * keeper already holds in a scope wins — the duplicate's copy of it is
     * dropped, since keeping both is exactly what the index forbids — and
     * everything else moves across. Dropped rows are kept in full for undo.
     */
    private static function moveScoped(
        string $table,
        string $column,
        string $scope,
        Resident $keeper,
        Resident $duplicate,
        array &$moved,
        array &$restore
    ): void {
        $held = DB::table($table)->where($column, $keeper->id)->pluck($scope);

        if ($held->isNotEmpty()) {
            $colliding = DB::table($table)
                ->where($column, $duplicate->id)
                ->whereIn($scope, $held)
                ->get();

            foreach ($colliding as $row) {
                $restore['deleted'][] = ['table' => $table, 'values' => (array) $row];
            }

            if ($colliding->isNotEmpty()) {
                DB::table($table)->whereIn('id', $colliding->pluck('id'))->delete();
            }
        }

        $ids = DB::table($table)->where($column, $duplicate->id)->pluck('id')->all();

        if ($ids !== []) {
            DB::table($table)->whereIn('id', $ids)->update([$column => $keeper->id]);
            $moved[$table][$column] = $ids;
        }
    }
}
