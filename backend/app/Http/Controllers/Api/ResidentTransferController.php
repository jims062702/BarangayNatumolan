<?php

namespace App\Http\Controllers\Api;

use App\Models\Household;
use App\Models\Resident;
use App\Support\SequenceNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Getting the register in and out as a spreadsheet.
 *
 * CSV, not xlsx. Every spreadsheet on earth opens it, it survives being
 * emailed and edited by somebody with no software the barangay chose, and a
 * file the office cannot open is not a backup.
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
    private const COLUMNS = [
        'resident_number', 'record_type', 'last_name', 'first_name', 'middle_name',
        'suffix', 'mother_maiden_name', 'gender', 'birthdate', 'birth_place',
        'civil_status', 'occupation', 'contact_number', 'email',
        'household_number', 'zone_purok', 'address', 'residency_status',
        'length_of_residence_years', 'educational_attainment',
        'demographic_classification', 'life_status', 'date_of_death',
        'is_active', 'sectors', 'remarks',
    ];

    private function canWrite(): bool
    {
        return in_array(auth()->user()?->office, ['Population', 'Admin'], true);
    }

    /**
     * The whole register as a CSV download.
     *
     * Streamed rather than built in memory: a barangay of twenty thousand is
     * a twenty-thousand-row file, and holding it all before sending the
     * first byte is how the request times out on the machine that needs it
     * most.
     */
    public function export(Request $request): StreamedResponse
    {
        $query = Resident::with(['household:id,household_number', 'sectors'])
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

        $filename = 'barangay-natumolan-residents-' . now()->format('Y-m-d') . '.csv';

        return response()->stream(function () use ($query) {
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

            $query->chunk(500, function ($residents) use ($out) {
                foreach ($residents as $r) {
                    fputcsv($out, [
                        $r->resident_number,
                        $r->record_type,
                        $r->last_name,
                        $r->first_name,
                        $r->middle_name,
                        $r->suffix,
                        $r->mother_maiden_name,
                        $r->gender,
                        $r->birthdate?->toDateString(),
                        $r->birth_place,
                        $r->civil_status,
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
                        $r->is_active ? 'Yes' : 'No',
                        // Semicolons, because a comma inside a CSV cell is
                        // a quoting problem waiting to be mis-parsed by
                        // whatever opens this next.
                        $r->sectors->pluck('sector_type')->join('; '),
                        $r->remarks,
                    ]);
                }
            });

            fclose($out);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
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
                'Adult; Farmer / Fisherfolk', '',
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
        DB::transaction(function () use ($parsed, &$created, &$updated, &$skipped) {
            foreach ($parsed['rows'] as $row) {
                if ($row['problems'] !== []) { $skipped++; continue; }

                $values = $row['values'];
                $sectors = $values['sectors'] ?? [];
                unset($values['sectors']);

                if ($row['action'] === 'update' && $row['resident_id']) {
                    $resident = Resident::find($row['resident_id']);
                    if (!$resident) { $skipped++; continue; }

                    // Only what the file actually said — see the class comment.
                    $resident->fill($values)->save();
                    $updated++;
                } else {
                    $values['resident_number'] = $values['resident_number']
                        ?? SequenceNumber::next('residents', 'resident_number', date('Y') . '-', 6);

                    $resident = Resident::create($values);
                    $created++;
                }

                foreach ($sectors as $sector) {
                    $resident->sectors()->firstOrCreate(
                        ['sector_type' => $sector],
                        ['enrolled_date' => now()->toDateString()]
                    );
                }
            }
        });

        return $this->success(
            compact('created', 'updated', 'skipped'),
            $created . ' added, ' . $updated . ' updated'
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
            'file' => 'required|file|mimes:csv,txt|max:8192',
        ]);

        $handle = fopen($request->file('file')->getRealPath(), 'r');

        if (!$handle) {
            return ['error' => 'That file could not be opened.'];
        }

        $header = fgetcsv($handle);

        if (!$header) {
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

        while (($data = fgetcsv($handle)) !== false) {
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

        fclose($handle);

        return [
            'rows' => $rows,
            'summary' => [
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
                  'address', 'educational_attainment', 'remarks'] as $plain) {
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

        if ($get('is_active') !== null) {
            $values['is_active'] = in_array(strtolower($get('is_active')), ['yes', '1', 'true', 'y'], true);
        }

        /* ---- the household, by its number ---- */
        if ($get('household_number') !== null) {
            $id = $households[$get('household_number')] ?? null;

            if ($id === null) {
                $problems[] = 'Household "' . $get('household_number') . '" is not on the register.';
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
            'problems' => $problems,
        ];
    }
}
