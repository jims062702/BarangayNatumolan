<?php

namespace App\Console\Commands;

use App\Models\Resident;
use Illuminate\Console\Command;

/**
 * Keeps a resident's age-derived demographic data consistent:
 *   1. the age-based sector tags — Child, Youth, Adult, Senior Citizen;
 *   2. the single `demographic_classification` column (= the age bracket).
 *
 * Registration assigns these automatically, but residents added before that
 * feature (or via the seeder) never got them, so the sector master lists came
 * up empty and the classification column was left NULL or stale (e.g. a manual
 * "PWD"/"Solo Parent" value, or an age bracket that has since drifted). Any
 * manual classification is first rescued into a sector tag so no information is
 * lost, then the column is set to the current age bracket.
 *
 * Idempotent — safe to re-run any time (e.g. once a year to catch age drift).
 * Manual sector tags (PWD, Solo Parent, 4Ps, …) are otherwise left untouched.
 */
class SyncResidentSectors extends Command
{
    protected $signature = 'residents:sync-sectors {--dry-run : Report changes without writing them}';

    protected $description = 'Sync age-based sectors + classification (Child, Youth, Adult, Senior) for residents';

    /** Manual classification values worth preserving as a sector tag. */
    private const MANUAL_CLASSIFICATIONS = ['PWD', 'Solo Parent'];

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $touched = 0;
        $added = 0;
        $deactivated = 0;
        $rescued = 0;
        $reclassified = 0;

        Resident::with('sectors')->chunkById(200, function ($residents) use (
            $dry, &$touched, &$added, &$deactivated, &$rescued, &$reclassified
        ) {
            foreach ($residents as $resident) {
                if (!$resident->birthdate) {
                    continue; // can't derive an age bracket without a birthdate
                }

                $changed = false;

                // 1) Rescue a manual classification (PWD/Solo Parent) into a
                //    sector tag before we overwrite the column, so it survives.
                $current = $resident->demographic_classification;
                if (in_array($current, self::MANUAL_CLASSIFICATIONS, true)) {
                    $existing = $resident->sectors->firstWhere('sector_type', $current);
                    if (!$existing || !$existing->is_active) {
                        $rescued++;
                        $changed = true;
                        if (!$dry) {
                            if ($existing) {
                                $existing->update(['is_active' => true, 'unenrolled_date' => null]);
                            } else {
                                $resident->sectors()->create([
                                    'sector_type' => $current,
                                    'enrolled_date' => now()->toDateString(),
                                ]);
                            }
                        }
                    }
                }

                // 2) Reconcile the four age-based sector tags.
                $want = $resident->ageSectors();
                $managed = $resident->sectors->whereIn('sector_type', Resident::AGE_SECTORS);
                $activeNow = $managed->where('is_active', true)->pluck('sector_type')->all();
                $toAdd = array_diff($want, $activeNow);
                $toRemove = array_diff($activeNow, $want);

                foreach ($toAdd as $sector) {
                    $added++;
                    $changed = true;
                    if ($dry) {
                        continue;
                    }
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
                    $changed = true;
                    if ($dry) {
                        continue;
                    }
                    $managed->firstWhere('sector_type', $sector)
                        ?->update(['is_active' => false, 'unenrolled_date' => now()->toDateString()]);
                }

                // 3) Set the classification column to the age bracket.
                $primary = $resident->primaryAgeClassification();
                if ($primary && $current !== $primary) {
                    $reclassified++;
                    $changed = true;
                    if (!$dry) {
                        $resident->update(['demographic_classification' => $primary]);
                    }
                }

                if ($changed) {
                    $touched++;
                }
            }
        });

        $prefix = $dry ? '[DRY RUN] ' : '';
        $this->info(
            "{$prefix}Residents changed: {$touched} · sectors added: {$added} · deactivated: {$deactivated}" .
            " · manual classifications rescued to sectors: {$rescued} · classification column fixed: {$reclassified}"
        );

        return self::SUCCESS;
    }
}
