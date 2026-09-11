<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * What has changed, and when — cheap enough to ask every second.
 *
 * The whole point is that `versions()` must stay trivial: one read of a table
 * with about a dozen rows. Everything expensive belongs on the other side of
 * it, run only when a version has actually moved.
 */
final class ChangeLog
{
    /**
     * The kinds of record a page waits on.
     *
     * Named here rather than derived from class names so a model can be
     * renamed without every browser in the barangay losing track of its
     * topic mid-shift.
     */
    public const TOPICS = [
        'residents', 'households', 'certificates', 'service_requests',
        'appointments', 'vawc_cases', 'lupon_cases', 'sessions',
        'announcements', 'officials', 'hero_slides', 'health',
        'population_events', 'chat', 'users',
    ];

    /** Move a topic on. Called after the write, never inside the read path. */
    public static function bump(string $topic): void
    {
        /*
         * One statement, and safe against two writes landing together: the
         * increment happens in the database rather than in PHP, so neither
         * write can read a stale number and put it back.
         */
        DB::statement(
            'INSERT INTO change_log (topic, version, changed_at) VALUES (?, 1, ?)
             ON DUPLICATE KEY UPDATE version = version + 1, changed_at = VALUES(changed_at)',
            [$topic, now()->toDateTimeString()],
        );
    }

    /**
     * Every topic and where it stands, as one map.
     *
     * Topics nobody has written to yet are absent from the table; they are
     * filled in as 0 so a client always gets the same shape and can tell
     * "nothing has ever happened" from "this topic does not exist".
     */
    public static function versions(): array
    {
        $rows = DB::table('change_log')->pluck('version', 'topic')->all();

        $out = [];

        foreach (self::TOPICS as $topic) {
            $out[$topic] = (int) ($rows[$topic] ?? 0);
        }

        return $out;
    }
}
