<?php

namespace App\Console\Commands;

use App\Models\Certificate;
use App\Models\Household;
use App\Models\PopulationEvent;
use App\Models\RbimCensus;
use App\Models\Resident;
use App\Models\ResidentSector;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Residents left behind by the automated checks.
 *
 * The live suites create real households through the real endpoints — that is
 * the point of them, and it is why they catch things a mocked test would not.
 * Most clean up after themselves; the ones that register a household through
 * Submit cannot, because submitting is the thing being tested and undoing it
 * would undo the evidence.
 *
 * They are recognisable: every suite stamps its people with the run's own
 * six-digit clock reading on the surname — "Bilang601729", "Tuldok600394".
 * No real surname ends in six digits.
 *
 * This removes them and everything hanging off them, so the dashboard counts
 * the barangay rather than the testing. It refuses to touch anybody else, and
 * it shows the list before it does anything.
 */
class PurgeTestResidents extends Command
{
    protected $signature = 'residents:purge-test {--dry-run : List what would go, and change nothing}';

    protected $description = 'Remove residents created by the automated live checks';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        /*
         * The surname stamp, and nothing else. Not "created today" — a real
         * resident registered today would match that — and not "no email",
         * which most of the register has.
         */
        $residents = Resident::whereRaw('last_name REGEXP "[0-9]{6}$"')->get();

        if ($residents->isEmpty()) {
            $this->info('Nothing to remove — no test residents on the register.');

            return self::SUCCESS;
        }

        $ids = $residents->pluck('id');

        $houses = Household::whereHas('residents', fn ($q) => $q->whereIn('id', $ids))
            ->withCount('residents')
            ->get();

        /* A household is only removed when EVERY member of it is going. */
        $emptied = $houses->filter(
            fn ($h) => $h->residents_count === $residents->where('household_id', $h->id)->count()
        );

        $this->table(
            ['ID', 'Number', 'Name', 'Registered'],
            $residents->map(fn ($r) => [
                $r->id,
                $r->resident_number,
                trim("{$r->first_name} {$r->last_name}"),
                (string) $r->created_at,
            ])->all()
        );

        $this->line('');
        $this->line("  residents:  {$residents->count()}");
        $this->line("  households: {$emptied->count()} emptied of {$houses->count()} touched");
        $this->line('  headcount after: ' . Resident::bonafide()->where('is_active', true)
            ->whereNotIn('id', $ids)->count());
        $this->line('');

        if ($dry) {
            $this->warn('Dry run — nothing was changed. Run again without --dry-run to remove them.');

            return self::SUCCESS;
        }

        if (! $this->confirm("Remove these {$residents->count()} residents and everything hanging off them?", false)) {
            $this->info('Left alone.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($ids, $emptied) {
            $requests = ServiceRequest::whereIn('resident_id', $ids)->pluck('id');
            Certificate::whereIn('service_request_id', $requests)->forceDelete();
            ServiceRequest::whereIn('id', $requests)->forceDelete();

            ResidentSector::whereIn('resident_id', $ids)->delete();
            PopulationEvent::whereIn('resident_id', $ids)->delete();
            User::whereIn('resident_id', $ids)->delete();

            /*
             * The census forms keep their answers and lose their link. A form
             * is a record of an interview; deleting the person it was matched
             * to does not mean the interview did not happen.
             */
            DB::table('rbim_census_members')->whereIn('resident_id', $ids)->update(['resident_id' => null]);

            /*
             * Break the head link first: a household points at its head, and
             * the resident points back at the household.
             *
             * The column is on the HOUSEHOLD — `household_head_id`. An
             * earlier version of this wrote `is_household_head` on the
             * resident, which is not a column at all: the command would have
             * thrown at this line, which --dry-run never reaches.
             */
            Household::whereIn('id', $emptied->pluck('id'))->update(['household_head_id' => null]);
            Resident::whereIn('id', $ids)->update(['household_id' => null]);

            Resident::whereIn('id', $ids)->forceDelete();

            RbimCensus::whereIn('household_id', $emptied->pluck('id'))->each(function ($census) {
                $census->members()->delete();
                $census->forceDelete();
            });

            Household::whereIn('id', $emptied->pluck('id'))->forceDelete();
        });

        $this->info('Removed. Headcount is now '
            . Resident::bonafide()->where('is_active', true)->count() . '.');

        return self::SUCCESS;
    }
}
