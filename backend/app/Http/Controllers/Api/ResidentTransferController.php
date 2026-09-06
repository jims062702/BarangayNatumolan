<?php

namespace App\Http\Controllers\Api;

use App\Models\Household;
use App\Models\Resident;
use App\Models\ResidentMarriage;
use App\Support\SequenceNumber;
use App\Support\Xlsx;
use App\Support\XlsxReader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Getting the register in and out as a spreadsheet.
 *
 * CSV by default, Excel on request. CSV is the one every spreadsheet on
 * earth opens, it survives being emailed and edited by somebody with no
 * software the barangay chose, and a file the office cannot open is not a
 * backup — so it stays the default. But a clerk who is going to open this in
 * Excel and nothing else should not have to answer an import dialogue about
 * delimiters every time, so .xlsx is there for them.
 *
 * One field is the resident's own: occupation. A file may bring one in for
 * somebody being created — a restore with every job blank is not a restore —
 * and is ignored for somebody already on the register, because changing that
 * is the resident's to do from their portal.
 *
 * Two rules the whole thing turns on:
 *
 *   - EXPORT is everything the register holds about a person, in one row.
 *   - IMPORT never guesses. A row that matches nobody is a new resident; a
 *     row that matches somebody is an update ONLY where the file actually
 *     says something. Blank cells leave the register alone, because "I did
 *     not fill this column in" and "this person has no occupation" arrive
 *     as exactly the same empty cell — and treating them alike is how a
 *     round-trip through Excel quietly empties half a register.
 */
class ResidentTransferController extends BaseController
{
    /**
     * The columns, in order, and where each one comes from.
     *
     * One list drives the export header, the import parser and the template,
     * so a column can never mean one thing going out and another coming in.
     */
    /**
     * Every field the resident form collects, so a file that goes out can
     * come back in as the same register.
     *
     * `demographic_classification` is the exception and is written out for
     * reading only: it is worked out from the birthdate, so importing it
     * would let a stale file overrule the arithmetic.
     */
    private const COLUMNS = [
        'resident_number', 'record_type', 'last_name', 'first_name', 'middle_name',
        'suffix', 'mother_maiden_name', 'gender', 'birthdate',
        'birthdate_is_estimated', 'birth_place',
        'civil_status', 'spouse_resident_number', 'union_type',
        'occupation', 'contact_number', 'email',
        'household_number', 'zone_purok', 'address', 'residency_status',
        'length_of_residence_years', 'educational_attainment',
        'demographic_classification', 'life_status', 'date_of_death',
        'life_status_note', 'is_active', 'sectors', 'remarks',
    ];

    private function canWrite(): bool
    {
        return in_array(auth()->user()?->office, ['Population', 'Admin'], true);
    }

    /**
     * The whole register as a download, in whichever of the two formats.
     *
     * Streamed rather than built in memory: a barangay of twenty thousand is
     * a twenty-thousand-row file, and holding it all before sending the
     * first byte is how the request times out on the machine that needs it
     * most.
     */
    public function export(Request $request): StreamedResponse
    {
        $query = Resident::with([
                'household:id,household_number',
                'sectors',
                /* Only the number is written out — an id means nothing to
                   whoever opens this file somewhere else. */
                'spouse:id,resident_number',
            ])
            ->whereNull('merged_into_id')
            ->orderBy('id');

        // Non-residents are on the register so families could be recorded
        // whole; they are not the barangay's population and are left out
        // unless asked for.
        if ($request->input('record_type') === Resident::NON_RESIDENT) {
            $query->where('record_type', Resident::NON_RESIDENT);
        } elseif (!$request->boolean('include_non_residents')) {
            $query->bonafide();
        }

        if ($request->filled('zone_purok')) {
            $query->where('zone_purok', $request->input('zone_purok'));
        }

        /*
         * The same name matching the registry list uses, so what a clerk
         * sees on screen and what comes out of the file are the same people.
         * A search that means one thing in the list and another in the export
         * is worse than no search at all.
         */
        if ($request->filled('search')) {
            $query->nameSearch($request->input('search'));
        }

        if ($request->filled('sector')) {
            $query->whereHas('sectors', fn ($q) => $q->where('sector_type', $request->input('sector')));
        }

        $stem = 'barangay-natumolan-residents-' . now()->format('Y-m-d');

        /*
         * Every open union, in one query, as resident id to its type.
         *
         * Both sides of a union are recorded on one row, so each row is read
         * into the map twice — once for each person in it.
         */
        $unionTypes = [];

        foreach (ResidentMarriage::open()->get(['resident_id', 'spouse_id', 'union_type']) as $union) {
            $unionTypes[$union->resident_id] = $union->union_type;
            $unionTypes[$union->spouse_id] = $union->union_type;
        }

        /*
         * ONE definition of a row, whichever format asked for it. Two copies
         * of twenty-six columns is two copies that drift, and the day they
         * do, the CSV and the spreadsheet quietly disagree about what the
         * register says.
         */
        $cells = fn (Resident $r) => [
            $r->resident_number,
            $r->record_type,
            $r->last_name,
            $r->first_name,
            $r->middle_name,
            $r->suffix,
            $r->mother_maiden_name,
            $r->gender,
            $r->birthdate?->toDateString(),
            /*
             * A birthdate from the census has no day — it is the end of the
             * month it was given for. Losing this flag turns an approximate
             * date into one the register would swear to.
             */
            $r->birthdate_is_estimated ? 'Yes' : 'No',
            $r->birth_place,
            $r->civil_status,
            $r->spouse?->resident_number,
            $unionTypes[$r->id] ?? null,
            $r->occupation,
            $r->contact_number,
            $r->email,
            $r->household?->household_number,
            $r->zone_purok,
            $r->address,
            $r->residency_status,
            $r->length_of_residence_years,
            $r->educational_attainment,
            $r->demographic_classification,
            $r->life_status,
            $r->date_of_death?->toDateString(),
            $r->life_status_note,
            $r->is_active ? 'Yes' : 'No',
            // Semicolons, because a comma inside a CSV cell is a quoting
            // problem waiting to be mis-parsed by whatever opens this next.
            $r->sectors->pluck('sector_type')->join('; '),
            $r->remarks,
        ];

        if ($request->input('format') === 'xlsx') {
            return response()->stream(function () use ($query, $cells) {
                Xlsx::write(self::COLUMNS, function (callable $row) use ($query, $cells) {
                    $query->chunk(500, function ($residents) use ($row, $cells) {
                        foreach ($residents as $resident) {
                            $row($cells($resident));
                        }
                    });
                });
            }, 200, [
                'Content-Type' => Xlsx::CONTENT_TYPE,
                'Content-Disposition' => 'attachment; filename="' . $stem . '.xlsx"',
            ]);
        }

        return response()->stream(function () use ($query, $cells) {
            $out = fopen('php://output', 'w');

            /*
             * A UTF-8 BOM, for Excel.
             *
             * Without it Excel on Windows reads the file as the system
             * codepage and every ñ in the register turns into mojibake — on
             * a Philippine name list that is most of the interesting rows.
             */
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, self::COLUMNS);

            $query->chunk(500, function ($residents) use ($out, $cells) {
                foreach ($residents as $resident) {
                    fputcsv($out, $cells($resident));
                }
            });

            fclose($out);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $stem . '.csv"',
        ]);
    }

    /** An empty file with the right header, so nobody has to guess the columns. */
    public function template(): StreamedResponse
    {
        return response()->stream(function () {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, self::COLUMNS);

            // One filled row, as an example. It is obvious enough to delete
            // and specific enough to copy.
            fputcsv($out, [
                '', 'Resident', 'Dela Cruz', 'Juan', 'Reyes', '', 'Santos',
                'Male', '1992-07-20', 'Tagoloan, Misamis Oriental', 'Married',
                'Driver', '+63 917 0000000', '', '', 'Purok 1', '', 'Permanent',
                '20', 'High School Graduate', '', 'Alive', '', 'Yes',
                'Adult; 4Ps Household', '',
            ]);

            fclose($out);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="resident-import-template.csv"',
        ]);
    }

    /**
     * Reads a CSV and says what it WOULD do — without doing any of it.
     *
     * The office is handing this system a file from somewhere else. Running
     * it blind and reporting afterwards is how a bad column mapping becomes
     * four hundred wrong records, so the preview is not optional politeness:
     * it is the only chance anybody gets to look.
     */
    public function preview(Request $request): JsonResponse
    {
        if (!$this->canWrite()) {
            return $this->forbidden('Your office cannot import into the resident registry');
        }

        $parsed = $this->parse($request);

        if (isset($parsed['error'])) {
            return $this->error($parsed['error'], 422);
        }

        return $this->success($parsed, 'Import preview ready — nothing has been saved.');
    }

    /** Does what the preview described. */
    public function import(Request $request): JsonResponse
    {
        if (!$this->canWrite()) {
            return $this->forbidden('Your office cannot import into the resident registry');
        }

        $parsed = $this->parse($request);

        if (isset($parsed['error'])) {
            return $this->error($parsed['error'], 422);
        }

        if ($parsed['summary']['errors'] > 0 && !$request->boolean('skip_bad_rows')) {
            return $this->error(
                $parsed['summary']['errors'] . ' row(s) have problems. Fix them, or import '
                    . 'again with "skip the bad rows" if you want the rest anyway.',
                422,
                ['rows' => array_slice($parsed['rows'], 0, 50)]
            );
        }

        $created = 0; $updated = 0; $skipped = 0;

        /*
         * All of it or none of it. A file that fails halfway leaves the
         * register in a state nobody chose and nobody can describe — worse
         * than the import simply not having happened.
         */
        $households = 0;
        $couples = 0;

        /* Line number to the resident it became, for the spouse pass below. */
        $written = [];

        DB::transaction(function () use (
            $parsed, &$created, &$updated, &$skipped, &$households, &$couples, &$written
        ) {
            /*
             * Households first, and once each.
             *
             * Ten members of one new household are ten rows naming the same
             * number; created row by row that is ten households, nine of them
             * empty. Made here, every row that names it finds the same one.
             */
            $made = [];

            foreach ($parsed['rows'] as $row) {
                $number = $row['new_household'] ?? null;

                if ($number === null || $row['problems'] !== [] || isset($made[$number])) {
                    continue;
                }

                /* firstOrCreate, not create: two imports of the same file must
                   not leave two households wearing one number. */
                $household = Household::firstOrCreate(
                    ['household_number' => $number],
                    [
                        'zone_purok' => $row['new_household_details']['zone_purok'] ?? null,
                        'street_address' => $row['new_household_details']['street_address'] ?? null,
                        'total_members' => 0,
                        'notes' => 'Created by an import on ' . now()->toDateString() . '.',
                    ]
                );

                $made[$number] = $household->id;

                if ($household->wasRecentlyCreated) {
                    $households++;
                }
            }

            foreach ($parsed['rows'] as $row) {
                if ($row['problems'] !== []) { $skipped++; continue; }

                $values = $row['values'];

                /* A row that named a household not on the register gets the
                   one just made for it. */
                if (($row['new_household'] ?? null) !== null) {
                    $values['household_id'] = $made[$row['new_household']] ?? null;
                }
                $sectors = $values['sectors'] ?? [];
                unset($values['sectors']);

                if ($row['action'] === 'update' && $row['resident_id']) {
                    $resident = Resident::find($row['resident_id']);
                    if (!$resident) { $skipped++; continue; }

                    /*
                     * A resident owns their own occupation, and a file that
                     * rewrites everybody's is the office editing it — the
                     * rule going out the back door. It may still be SET on
                     * somebody being created below, or a register rebuilt
                     * from a backup would come back with every job blank.
                     */
                    unset($values['occupation']);

                    // Only what the file actually said — see the class comment.
                    $resident->fill($values)->save();
                    $updated++;
                    $written[$row['line']] = $resident;
                } else {
                    $values['resident_number'] = $values['resident_number']
                        ?? SequenceNumber::next('residents', 'resident_number', date('Y') . '-', 6);

                    $resident = Resident::create($values);
                    $created++;
                    $written[$row['line']] = $resident;
                }

                foreach ($sectors as $sector) {
                    $resident->sectors()->firstOrCreate(
                        ['sector_type' => $sector],
                        ['enrolled_date' => now()->toDateString()]
                    );
                }
            }

            /*
             * The couples, now that both halves of every one of them exist.
             *
             * A spouse named but not in the file and not on the register is
             * left alone rather than refused: the office may be importing one
             * purok at a time, and the partner arrives with the next file.
             */
            foreach ($parsed['rows'] as $row) {
                $number = $row['spouse_number'] ?? null;

                if ($number === null || $row['problems'] !== []) {
                    continue;
                }

                $person = $written[$row['line']] ?? null;
                $spouse = Resident::where('resident_number', $number)->first();

                if (! $person || ! $spouse || $person->id === $spouse->id) {
                    continue;
                }

                /* Already married to each other — importing the same file
                   twice must not open a second union for one couple. */
                if ((int) $person->fresh()->spouse_id === $spouse->id) {
                    continue;
                }

                $person->marryTo($spouse, null, $row['union_type'] ?? 'Married');
                $couples++;
            }
        });

        /*
         * Household member counts are kept on the household row, and the
         * import has just changed who is in several of them.
         */
        Household::whereIn('id', Resident::whereNotNull('household_id')->distinct()->pluck('household_id'))
            ->each(fn (Household $h) => $h->update(['total_members' => $h->residents()->count()]));

        return $this->success(
            compact('created', 'updated', 'skipped', 'households', 'couples'),
            $created . ' added, ' . $updated . ' updated'
                . ($households ? ', ' . $households . ' household(s) created' : '')
                . ($couples ? ', ' . $couples . ' couple(s) linked' : '')
                . ($skipped ? ', ' . $skipped . ' skipped' : '') . '.'
        );
    }

    /* ------------------------------------------------------------------ */

    /**
     * Turns the uploaded file into a row-by-row plan.
     *
     * Every row comes back with what would happen to it and what is wrong
     * with it, so the preview and the import read the same thing and cannot
     * disagree.
     */
    private function parse(Request $request): array
    {
        $request->validate([
            /*
             * The office exports in both formats, so it may hand either one
             * back. `mimes` checks the real content and not the extension —
             * an .xlsx is a zip, which is what Laravel calls it.
             */
            'file' => 'required|file|mimes:csv,txt,xlsx,zip|max:8192',
        ]);

        $upload = $request->file('file');
        $grid = [];
        $isSpreadsheet = strtolower($upload->getClientOriginalExtension()) === 'xlsx';

        if ($isSpreadsheet) {
            try {
                $grid = XlsxReader::rows($upload->getRealPath());
            } catch (\Throwable $failure) {
                return ['error' => $failure->getMessage()];
            }
        }

        $handle = $isSpreadsheet ? null : fopen($upload->getRealPath(), 'r');

        if (! $isSpreadsheet && ! $handle) {
            return ['error' => 'That file could not be opened.'];
        }

        /*
         * One reader for both kinds of file, so everything past this point —
         * the header check, the row plan, the preview — cannot treat a
         * spreadsheet differently from a CSV.
         */
        $at = 0;
        $nextRow = function () use ($handle, &$grid, &$at, $isSpreadsheet) {
            if ($isSpreadsheet) {
                return $at < count($grid) ? $grid[$at++] : false;
            }

            return fgetcsv($handle);
        };

        $header = $nextRow();

        if (! $header) {
            return ['error' => 'The file is empty.'];
        }

        // Strip the BOM Excel writes back, or the first column name never
        // matches and every row looks like it is missing a surname.
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
        $header = array_map(fn ($h) => strtolower(trim((string) $h)), $header);

        foreach (['last_name', 'first_name'] as $needed) {
            if (!in_array($needed, $header, true)) {
                return ['error' => 'The file needs at least a "' . $needed
                    . '" column. Download the template if you are not sure of the columns.'];
            }
        }

        $households = Household::pluck('id', 'household_number');
        $rows = [];
        $line = 1;

        while (($data = $nextRow()) !== false) {
            $line++;

            // Excel leaves trailing blank lines in almost every saved file.
            if (count(array_filter($data, fn ($c) => trim((string) $c) !== '')) === 0) {
                continue;
            }

            $rows[] = $this->planRow(
                array_combine($header, array_pad(array_slice($data, 0, count($header)), count($header), null)),
                $line,
                $households
            );
        }

        if ($handle) {
            fclose($handle);
        }

        return [
            'rows' => $rows,
            'summary' => [
                /* Distinct: ten members of one new household is ONE household. */
                'new_households' => count(array_unique(array_filter(
                    array_column($rows, 'new_household')
                ))),
                'total' => count($rows),
                'create' => count(array_filter($rows, fn ($r) => $r['action'] === 'create' && !$r['problems'])),
                'update' => count(array_filter($rows, fn ($r) => $r['action'] === 'update' && !$r['problems'])),
                'errors' => count(array_filter($rows, fn ($r) => $r['problems'] !== [])),
            ],
        ];
    }

    /** What one row means, and what is wrong with it. */
    private function planRow(array $cell, int $line, $households): array
    {
        $get = function (string $key) use ($cell) {
            $value = trim((string) ($cell[$key] ?? ''));

            return $value === '' ? null : $value;
        };

        $problems = [];
        $values = [];

        foreach (['last_name', 'first_name', 'middle_name', 'suffix', 'mother_maiden_name',
                  'birth_place', 'occupation', 'contact_number', 'email', 'zone_purok',
                  'address', 'educational_attainment', 'life_status_note', 'remarks'] as $plain) {
            if ($get($plain) !== null) { $values[$plain] = $get($plain); }
        }

        if (!$get('last_name') || !$get('first_name')) {
            $problems[] = 'A first name and a last name are required.';
        }

        /* ---- the fields with a fixed set of answers ---- */
        $choice = function (string $key, array $allowed) use ($get, &$problems, &$values) {
            $raw = $get($key);
            if ($raw === null) { return; }

            foreach ($allowed as $option) {
                if (strcasecmp($raw, $option) === 0) { $values[$key] = $option; return; }
            }

            $problems[] = ucfirst(str_replace('_', ' ', $key)) . ' "' . $raw
                . '" is not one of: ' . implode(', ', $allowed) . '.';
        };

        $choice('gender', ['Male', 'Female', 'Other']);
        $choice('civil_status', ['Single', 'Married', 'Widowed', 'Separated', 'Divorced']);
        $choice('residency_status', ['Permanent', 'Temporary', 'Migrant']);
        $choice('life_status', ['Alive', 'Deceased']);
        $choice('record_type', ['Resident', 'Non-resident']);

        /* ---- dates ---- */
        foreach (['birthdate', 'date_of_death'] as $dateKey) {
            $raw = $get($dateKey);
            if ($raw === null) { continue; }

            try {
                $values[$dateKey] = \Carbon\Carbon::parse($raw)->toDateString();
            } catch (\Throwable) {
                $problems[] = ucfirst(str_replace('_', ' ', $dateKey)) . ' "' . $raw
                    . '" is not a date the system can read. Use YYYY-MM-DD.';
            }
        }

        if ($get('length_of_residence_years') !== null) {
            $values['length_of_residence_years'] = (int) $get('length_of_residence_years');
        }

        $yesNo = fn (string $raw) => in_array(strtolower($raw), ['yes', '1', 'true', 'y'], true);

        if ($get('is_active') !== null) {
            $values['is_active'] = $yesNo($get('is_active'));
        }

        if ($get('birthdate_is_estimated') !== null) {
            $values['birthdate_is_estimated'] = $yesNo($get('birthdate_is_estimated'));
        }

        /* ---- the household, by its number ---- */
        $newHousehold = null;

        if ($get('household_number') !== null) {
            $id = $households[$get('household_number')] ?? null;

            if ($id === null) {
                /*
                 * Not a problem — a household to be made. Refusing the row
                 * would mean the office has to create the household by hand
                 * before the file will load, which is the import done twice.
                 *
                 * It is named in the plan so the preview can show it, because
                 * one mistyped number would otherwise found a household of
                 * one person that nobody meant to exist.
                 */
                $newHousehold = $get('household_number');
            } else {
                $values['household_id'] = $id;
            }
        }

        $sectors = $get('sectors')
            ? array_values(array_filter(array_map('trim', preg_split('/[;,]/', $get('sectors')))))
            : [];

        /*
         * Which resident this is, if any.
         *
         * The number first, because it is the register's own identifier and
         * cannot mean two people. Falling back to name-and-birthdate is a
         * guess, and a wrong guess here OVERWRITES somebody — so it is only
         * made when both agree, and never on a name alone.
         */
        $existing = null;

        if ($get('resident_number')) {
            $existing = Resident::where('resident_number', $get('resident_number'))->first();

            if (!$existing) {
                // Keep the number the file gave: an office importing its own
                // export expects its numbers back, not new ones.
                $values['resident_number'] = $get('resident_number');
            }
        } elseif ($get('birthdate') && isset($values['birthdate'])) {
            $existing = Resident::whereRaw('LOWER(last_name) = ?', [strtolower($get('last_name') ?? '')])
                ->whereRaw('LOWER(first_name) = ?', [strtolower($get('first_name') ?? '')])
                ->whereDate('birthdate', $values['birthdate'])
                ->first();
        }

        if ($get('email') && $existing?->email !== $get('email')) {
            $taken = Resident::where('email', $get('email'))
                ->when($existing, fn ($q) => $q->where('id', '!=', $existing->id))
                ->exists();

            if ($taken) {
                $problems[] = 'The email ' . $get('email') . ' already belongs to another resident.';
            }
        }

        if ($sectors !== []) { $values['sectors'] = $sectors; }

        return [
            'line' => $line,
            'name' => trim(($get('first_name') ?? '') . ' ' . ($get('last_name') ?? '')),
            'action' => $existing ? 'update' : 'create',
            'resident_id' => $existing?->id,
            'matched_number' => $existing?->resident_number,
            'values' => $values,
            /*
             * Left for a second pass. Row 1 can name row 2 as their spouse,
             * and row 2 does not exist yet while row 1 is being read.
             */
            'spouse_number' => $get('spouse_resident_number'),
            'union_type' => $get('union_type') === null
                ? null
                : (strcasecmp($get('union_type'), ResidentMarriage::LIVE_IN) === 0
                    ? ResidentMarriage::LIVE_IN
                    : 'Married'),
            /* The household this row would bring into being, if any. */
            'new_household' => $newHousehold,
            /* What the household would be given, from this same row. */
            'new_household_details' => $newHousehold === null ? null : [
                'zone_purok' => $get('zone_purok'),
                'street_address' => $get('address'),
            ],
            'problems' => $problems,
        ];
    }
}
