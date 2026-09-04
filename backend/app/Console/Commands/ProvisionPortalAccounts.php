<?php

namespace App\Console\Commands;

use App\Models\Resident;
use App\Support\PortalAccount;
use Illuminate\Console\Command;

/**
 * Backfills portal accounts for residents registered BEFORE accounts became
 * automatic. Registration now issues one on the spot, so this exists to catch
 * the existing register up — and to pick up anyone whose email address was
 * added to their record after the fact.
 */
class ProvisionPortalAccounts extends Command
{
    protected $signature = 'residents:provision-accounts
                            {--dry-run : List who would get an account without creating any}';

    protected $description = 'Create portal accounts for active residents who have an email but no login yet';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        // A non-resident gets no portal account: they are on the register
        // so a family could be recorded, not to be served online.
        $residents = Resident::bonafide()->where('is_active', true)
            ->whereNotNull('email')
            ->whereDoesntHave('account')
            ->orderBy('last_name')
            ->get();

        if ($residents->isEmpty()) {
            $this->info('Every active resident with an email address already has a portal account.');

            return self::SUCCESS;
        }

        $this->info($residents->count() . ' resident(s) without a portal account.');

        $created = 0;
        $skipped = [];

        foreach ($residents as $resident) {
            if ($dryRun) {
                $this->line('  would create: ' . $resident->full_name . ' <' . $resident->email . '>');
                continue;
            }

            $result = PortalAccount::provision($resident);

            if ($result['created']) {
                $created++;
                $this->line('  created: ' . $resident->full_name . ' <' . $resident->email . '>');
            } else {
                $skipped[] = $resident->full_name . ' — ' . $result['reason'];
            }
        }

        if ($dryRun) {
            $this->comment('Dry run: nothing was created.');

            return self::SUCCESS;
        }

        $this->info($created . ' account(s) created. Each resident was emailed their sign-in details '
            . 'and must enter a verification code the first time they sign in.');

        foreach ($skipped as $reason) {
            $this->warn('  skipped: ' . $reason);
        }

        return self::SUCCESS;
    }
}
