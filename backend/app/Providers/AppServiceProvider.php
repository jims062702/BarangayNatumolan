<?php

namespace App\Providers;

use App\Support\ChangeLog;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;
use Illuminate\Database\Eloquent\SoftDeletes;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * How long a signed-in person may do nothing before they are signed out.
     *
     * Three hours, the same for every desk. A shorter window was argued for
     * the VAWC desk, whose screens carry survivor records in a hall that
     * other people walk through; the barangay chose one number for everyone.
     */
    private const IDLE_HOURS = 3;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->watchForChanges();
        $this->expireIdleTokens();
        $this->limitPasswordResets();
    }

    /**
     * Counted per ACCOUNT, not per address.
     *
     * The plain `throttle:5,10` keys on the caller's IP, and a barangay hall
     * is one IP. One clerk resetting a password would lock out the next four
     * people to try — and during development the test suite and the browser
     * shared 127.0.0.1, which is exactly how this was found.
     *
     * The per-account limit is the one that means something: it stops an
     * address being mail-bombed with codes. The per-address limit stays, far
     * looser, to stop a machine hammering the route — twenty colleagues
     * behind one router are not each other's problem.
     */
    private function limitPasswordResets(): void
    {
        /*
         * Whose bucket this is.
         *
         * The forgotten-password forms name the account in the body; the
         * signed-in change-password route does not, and must not — it works
         * on the address already on the account. Without this fallback both
         * limiters keyed every signed-in request on the SAME empty string,
         * making one shared five-per-ten-minutes bucket for the whole
         * barangay: one resident changing their password would have locked
         * out everybody else's.
         */
        $account = fn (Request $request) => strtolower(trim(
            (string) ($request->input('email') ?: $request->user()?->email)
        ));

        /*
         * Asking for a code sends mail, so five in ten minutes is plenty —
         * more than that is somebody being mail-bombed, not somebody trying.
         */
        RateLimiter::for('password-reset-request', function (Request $request) use ($account) {
            $email = $account($request);

            return [
                Limit::perMinutes(10, 5)->by('reset-request:' . $email),
                Limit::perMinutes(10, 60)->by('reset-from:' . $request->ip()),
            ];
        });

        /*
         * ANSWERING the code is a different act with a different ceiling.
         *
         * The real limit on guesses is five, counted on the reset row itself.
         * Set to five here as well, the route refused the fifth guess before
         * that counter could reach it — so the careful rule never ran and the
         * message was about traffic rather than about the code. Fifteen keeps
         * the route out of the way of the rule that actually matters.
         */
        RateLimiter::for('password-reset-submit', function (Request $request) use ($account) {
            $email = $account($request);

            return [
                Limit::perMinutes(10, 15)->by('reset-submit:' . $email),
                Limit::perMinutes(10, 60)->by('reset-from:' . $request->ip()),
            ];
        });
    }

    /**
     * A token that has not been used for three hours stops working.
     *
     * The setting people reach for — SESSION_LIFETIME — governs nothing here:
     * this application signs in with a Sanctum bearer token, not a session
     * cookie. Sanctum's own `expiration` is no use either, because it counts
     * from when the token was ISSUED, so it would sign out somebody in the
     * middle of a busy afternoon and let an abandoned one live just as long.
     *
     * Idle is the thing worth measuring, and `last_used_at` measures it.
     *
     * This runs BEFORE Sanctum stamps the token as used (Guard.php checks
     * validity at line 45 and writes last_used_at at 167), which is the only
     * reason the old value is still readable here.
     */
    private function expireIdleTokens(): void
    {
        Sanctum::authenticateAccessTokensUsing(
            static function (PersonalAccessToken $token, bool $isValid) {
                if (! $isValid) {
                    return false;
                }

                /* Never used: judged from when it was issued, so a token
                   minted and abandoned still ages out. */
                $lastSeen = $token->last_used_at ?? $token->created_at;

                if ($lastSeen === null) {
                    return true;
                }

                if ($lastSeen->gt(now()->subHours(self::IDLE_HOURS))) {
                    return true;
                }

                /*
                 * Deleted, not merely refused.
                 *
                 * Left in the table it is a working key the moment somebody
                 * changes this rule back — and the register already holds
                 * hundreds of tokens nobody has used in a week.
                 */
                $token->delete();

                return false;
            }
        );
    }

    /**
     * Which models move which topic.
     *
     * The map is the whole contract: a page waits on a topic, and every model
     * that could change what that page shows is listed under it. A model
     * missing here is a screen that quietly stops updating — nothing fails,
     * it simply shows an older answer — so the list is written out in full
     * rather than guessed from class names.
     */
    private function watchForChanges(): void
    {
        $topics = [
            'residents' => [
                \App\Models\Resident::class,
                \App\Models\ResidentSector::class,
                \App\Models\ResidentMarriage::class,
                \App\Models\Guardianship::class,
            ],
            'households' => [
                \App\Models\Household::class,
                \App\Models\HouseholdOwnerChange::class,
            ],
            'certificates' => [\App\Models\CertificateClearance::class],
            'service_requests' => [\App\Models\ServiceRequest::class],
            'appointments' => [\App\Models\Appointment::class],

            /* The desk watches the case, but a referral or a follow-up
               changes what the docket says about it just as much. */
            'vawc_cases' => [
                \App\Models\VawcCase::class,
                \App\Models\VawcIncident::class,
                \App\Models\VawcReferral::class,
                \App\Models\VawcFollowup::class,
                \App\Models\VawcDocument::class,
            ],
            'lupon_cases' => [
                \App\Models\LuponCase::class,
                \App\Models\LuponHearing::class,
                \App\Models\LuponSettlement::class,
                \App\Models\LuponComplaint::class,
            ],
            'sessions' => [
                \App\Models\BarangaySession::class,
                \App\Models\BarangaySessionAttendee::class,
            ],
            'announcements' => [\App\Models\Announcement::class],
            'officials' => [\App\Models\Official::class],
            'hero_slides' => [\App\Models\HeroSlide::class],
            'health' => [
                \App\Models\HealthVisit::class,
                \App\Models\MaternalHealth::class,
                \App\Models\ChildHealth::class,
                \App\Models\ImmunizationRecord::class,
            ],
            'population_events' => [\App\Models\PopulationEvent::class],
            'chat' => [
                \App\Models\ChatConversation::class,
                \App\Models\ChatMessage::class,
            ],
            'users' => [\App\Models\User::class],
        ];

        foreach ($topics as $topic => $models) {
            foreach ($models as $model) {
                /*
                 * Closures rather than an observer class.
                 *
                 * `observe()` keeps only the CLASS NAME and lets the container
                 * build it, so an observer taking its topic as a constructor
                 * argument cannot be resolved at all — which is what a first
                 * attempt here did, and it brought the application down on
                 * boot. A closure carries the topic with it.
                 */
                $events = ['created', 'updated', 'deleted'];

                /* `restored` exists only where rows can come back. Registering
                   it on a model that deletes for good is a BadMethodCall that
                   takes the whole application down on boot. */
                if (in_array(SoftDeletes::class, class_uses_recursive($model), true)) {
                    $events[] = 'restored';
                }

                foreach ($events as $event) {
                    $model::{$event}(static fn () => ChangeLog::bump($topic));
                }
            }
        }
    }
}
