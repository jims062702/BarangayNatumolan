<?php

namespace App\Console\Commands;

use App\Models\Resident;
use Illuminate\Console\Command;

/**
 * Backfills (and keeps current) the age-based sector tags — Child, Youth,
 * Adult, Senior Citizen — for residents.
 *
 * Registration assigns these automatically, but residents added before that
 * feature (or via the seeder) never got them, so the sector master lists came
 * up empty for them. Age also drifts over time (a 17-year-old "Child + Youth"
 * becomes an 18-year-old "Youth"), so this reconciles both directions.
 *
 * Idempotent — safe to re-run any time (e.g. once a year to catch drift).
 * Only the four age brackets are managed; manual tags (Solo Parent, PWD,
 * 4Ps, …) are never touched.
 */
class SyncResidentSectors extends Command
{
    protected $signature = 'residents:sync-sectors {--dry-run : Report changes without writing them}';

    protected $description = 'Backfill/refresh age-based sectors (Child, Youth, Adult, Senior Citizen) for residents';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $touched = 0;
        $added = 0;
        $deactivated = 0;

        Resident::with('sectors')->chunkById(200, function ($residents) use ($dry, &$touched, &$added, &$deactivated) {
            foreach ($residents as $resident) {
                if (!$resident->birthdate) {
                    continue; // can't derive an age bracket without a birthdate
                }

                $want = $resident->ageSectors();

                // Only the age-managed rows already on file for this resident.
                $managed = $resident->sectors->whereIn('sector_type', Resident::AGE_SECTORS);
                $activeNow = $managed->where('is_active', true)->pluck('sector_type')->all();

                $toAdd = array_diff($want, $activeNow);
                $toRemove = array_diff($activeNow, $want);

                if (empty($toAdd) && empty($toRemove)) {
                    continue;
                }
                $touched++;

                foreach ($toAdd as $sector) {
                    $added++;
                    if ($dry) {
                        continue;
                    }
                    // A soft-removed row may already exist (unique per sector);
                    // reactivate it instead of inserting a duplicate.
                    $existing = $managed->firstWhere('sector_type', $sector);
                    if ($existing) {
                        $existing->update(['is_active' => true, 'unenrolled_date' => null]);
                    } else {
                        $resident->sectors()->create([
                            'sector_type' => $sector,
                            'enrolled_date' => now()->toDateString(),
                        ]);
                    }
                }

                foreach ($toRemove as $sector) {
                    $deactivated++;
                    if ($dry) {
                        continue;
                    }
                    $row = $managed->firstWhere('sector_type', $sector);
                    $row?->update(['is_active' => false, 'unenrolled_date' => now()->toDateString()]);
                }
            }
        });

        $prefix = $dry ? '[DRY RUN] ' : '';
        $this->info("{$prefix}Residents changed: {$touched} · sectors added: {$added} · deactivated: {$deactivated}");

        return self::SUCCESS;
    }
}
