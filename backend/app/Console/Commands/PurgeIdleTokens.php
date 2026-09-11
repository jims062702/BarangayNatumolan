<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Clears out sign-ins nobody came back to.
 *
 * The rule that expires an idle token only fires when somebody presents it,
 * so a token from a browser that was simply closed sits in the table for
 * ever — valid, and one config change away from working again. The register
 * held more than seven hundred of those before this existed.
 *
 * Run it from the scheduler, or by hand after a busy day.
 */
class PurgeIdleTokens extends Command
{
    protected $signature = 'tokens:purge-idle
                            {--hours=3 : Idle for longer than this}
                            {--dry-run : Count them without deleting}';

    protected $description = 'Delete sign-ins that have been idle past the limit';

    public function handle(): int
    {
        $hours = max(1, (int) $this->option('hours'));
        $cutoff = now()->subHours($hours);

        /*
         * A token never used is judged by when it was issued. Without that
         * clause a token minted and abandoned the same minute would live for
         * ever, which is exactly the case worth clearing.
         */
        $stale = DB::table('personal_access_tokens')
            ->where(function ($q) use ($cutoff) {
                $q->where('last_used_at', '<', $cutoff)
                    ->orWhere(function ($q) use ($cutoff) {
                        $q->whereNull('last_used_at')->where('created_at', '<', $cutoff);
                    });
            });

        $count = (clone $stale)->count();
        $total = DB::table('personal_access_tokens')->count();

        if ($this->option('dry-run')) {
            $this->info("{$count} of {$total} sign-ins have been idle for more than {$hours}h.");
            $this->line('Nothing was deleted. Drop --dry-run to clear them.');

            return self::SUCCESS;
        }

        $stale->delete();

        $this->info("Cleared {$count} idle sign-in(s); " . ($total - $count) . ' still active.');

        return self::SUCCESS;
    }
}
