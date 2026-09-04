<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Age is not a fact anybody types in — it is a fact about today.
 *
 * A resident's age comes from their birthdate every time it is read, so it is
 * always right on screen. Their SECTOR does not: Child, Youth, Adult and
 * Senior Citizen are rows in `resident_sectors`, written when the record was
 * created, and nothing moves them afterwards. Without this, a child who turns
 * fifteen stays on the children's list until somebody notices — which is how
 * a barangay ends up planning a feeding programme around a list of people who
 * grew up.
 *
 * Every night, then. The command is idempotent and only writes what changed,
 * so a night with no birthdays costs one pass and no writes.
 *
 * This needs the scheduler running: one cron entry on the server,
 *   * * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
 * or, on this XAMPP machine, a Task Scheduler job doing the same. Without it
 * the sectors still correct themselves the next time anybody runs
 * `php artisan residents:sync-sectors` by hand.
 */
Schedule::command('residents:sync-sectors')
    ->dailyAt('00:30')
    ->withoutOverlapping()
    ->onOneServer();
