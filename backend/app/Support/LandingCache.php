<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Cache keys for the public landing-page content (hero pictures, officials,
 * announcements). These endpoints are hit by every visitor, so responses are
 * cached and only rebuilt when the SK office changes something.
 */
class LandingCache
{
    public const HERO_KEY = 'landing.hero_slides';
    public const OFFICIALS_KEY = 'landing.officials';
    public const STATS_KEY = 'landing.stats';

    private const ANNOUNCEMENTS_VERSION_KEY = 'landing.announcements.version';

    /**
     * Announcements are paginated/filtered, so each page+category combination
     * gets its own key stamped with a version number. Bumping the version
     * invalidates every combination at once.
     */
    public static function announcementsKey(int $page, string $category): string
    {
        $version = (int) Cache::get(self::ANNOUNCEMENTS_VERSION_KEY, 1);

        return 'landing.announcements.v' . $version . '.p' . $page . '.c' . md5($category);
    }

    public static function clearHeroSlides(): void
    {
        Cache::forget(self::HERO_KEY);
    }

    public static function clearOfficials(): void
    {
        Cache::forget(self::OFFICIALS_KEY);
    }

    /** Invalidate the public "at a glance" counts (call on registry writes). */
    public static function clearStats(): void
    {
        Cache::forget(self::STATS_KEY);
    }

    public static function clearAnnouncements(): void
    {
        Cache::forever(
            self::ANNOUNCEMENTS_VERSION_KEY,
            (int) Cache::get(self::ANNOUNCEMENTS_VERSION_KEY, 1) + 1
        );
    }
}
