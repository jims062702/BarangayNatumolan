<?php

namespace App\Console\Commands;

use App\Models\CertificateClearance;
use App\Models\ServiceRequest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Pads reference numbers that were issued too narrow.
 *
 * A number like REQ-2026-00012 has five digits where every number the system
 * issues now has six. Nothing is wrong with the RECORD — but the label lies
 * about order, because text sorts character by character:
 *
 *     REQ-2026-000013   ← six digits, sorts FIRST
 *     REQ-2026-00012    ← five digits, sorts second
 *
 * So a clerk reading two slips side by side sees a lower number sitting
 * after a higher one and reasonably concludes the desk skipped somebody.
 * Every list in the app sorts by TIME, so nothing is actually out of order —
 * but a number that reads wrong is a number that gets queried, and the desk
 * should not have to explain its own numbering.
 *
 * Refuses to move a number onto one that is taken. Two records sharing a
 * reference is far worse than one being narrow.
 *
 * Idempotent. Run it twice and the second pass finds nothing.
 */
class NormaliseReferenceNumbers extends Command
{
    protected $signature = 'references:normalise {--dry-run : Show what would change, and write nothing}';

    protected $description = 'Pad short request and certificate reference numbers to the standard width';

    /** table => [column, prefix length, digits] */
    private const SERIES = [
        'service_requests' => ['request_number', 'REQ-', 6],
        'certificates_clearances' => ['certificate_number', 'CERT-', 6],
    ];

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $fixed = 0;
        $blocked = 0;

        foreach (self::SERIES as $table => [$column, $prefix, $digits]) {
            $rows = DB::table($table)
                ->select('id', $column)
                ->where($column, 'like', $prefix . '%')
                ->orderBy('id')
                ->get();

            foreach ($rows as $row) {
                $value = $row->{$column};

                // "REQ-2026-" — the prefix plus the year and its dash.
                $head = substr($value, 0, strlen($prefix) + 5);
                $tail = substr($value, strlen($prefix) + 5);

                if (!ctype_digit($tail) || strlen($tail) >= $digits) {
                    continue;
                }

                $padded = $head . str_pad($tail, $digits, '0', STR_PAD_LEFT);

                $taken = DB::table($table)->where($column, $padded)->exists();

                if ($taken) {
                    $blocked++;
                    $this->warn("  blocked  {$value} → {$padded} is already in use; left alone");
                    continue;
                }

                $this->line("  pad      {$value} → {$padded}");
                $fixed++;

                if (!$dry) {
                    DB::table($table)->where('id', $row->id)->update([$column => $padded]);
                }
            }
        }

        $this->newLine();

        if ($blocked > 0) {
            $this->warn("{$blocked} left alone: padding them would collide with a number already issued.");
        }

        $this->info($dry
            ? "{$fixed} number(s) would be padded. Nothing was written."
            : "{$fixed} number(s) padded.");

        return self::SUCCESS;
    }
}
