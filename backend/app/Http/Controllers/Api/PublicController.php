<?php

namespace App\Http\Controllers\Api;

use App\Models\Announcement;
use App\Models\CertificateClearance;
use App\Models\HeroSlide;
use App\Models\Household;
use App\Models\Official;
use App\Models\Resident;
use App\Models\ServiceGuide;
use App\Support\LandingCache;
use App\Models\Appointment;
use App\Models\Notification;
use App\Models\User;
use App\Support\SequenceNumber;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Endpoints that require no authentication: certificate verification,
 * published announcements, and the AI-assisted service guide.
 */
class PublicController extends BaseController
{
    /** QR / reference-number verification of an issued certificate. */
    public function verifyCertificate(string $referenceNumber)
    {
        $certificate = CertificateClearance::with('resident:id,first_name,last_name')
            ->where('reference_number', $referenceNumber)
            ->first();

        if (!$certificate) {
            return $this->success([
                'valid' => false,
                'message' => 'No certificate found for this reference number.',
            ], 'Verification complete');
        }

        /*
         * A certificate is genuine from the moment it is signed — that is the
         * act that makes the paper real — so verification succeeds for one
         * waiting on the counter as well as one already handed over. Anything
         * still being prepared, or cancelled, is not a document yet.
         */
        return $this->success([
            'valid' => in_array($certificate->status, ['Ready to Claim', 'Released'], true),
            'certificate_number' => $certificate->certificate_number,
            'certificate_type' => $certificate->certificate_type,
            'holder' => $certificate->resident?->full_name,
            'status' => $certificate->status,
            'issued_at' => $certificate->released_at ?? $certificate->signed_at,
        ], 'Verification complete');
    }

    /**
     * Active home-section carousel pictures (SK-managed).
     * Cached until the SK office changes them — this endpoint is hit by
     * every landing-page visitor.
     */
    public function heroSlides()
    {
        $slides = Cache::remember(LandingCache::HERO_KEY, now()->addDay(), fn () =>
            HeroSlide::where('is_active', true)
                ->orderBy('sort_order')->orderBy('id')
                ->get()->toArray()
        );

        return $this->success($slides, 'Hero slides retrieved');
    }

    /** Active officials grouped Barangay / SK (SK-managed). Cached. */
    public function officials()
    {
        $grouped = Cache::remember(LandingCache::OFFICIALS_KEY, now()->addDay(), function () {
            $officials = Official::where('is_active', true)->ordered()->get();

            return [
                'barangay' => $officials->where('group', 'Barangay')->values()->toArray(),
                'sk' => $officials->where('group', 'SK')->values()->toArray(),
            ];
        });

        return $this->success($grouped, 'Officials retrieved');
    }

    /**
     * Public "barangay at a glance" counts, sourced from the Population
     * Office registry. Aggregate numbers only — no personal data. Cached and
     * refreshed whenever the registry changes (see ResidentController).
     */
    public function stats()
    {
        $stats = Cache::remember(LandingCache::STATS_KEY, now()->addHour(), fn () => [
            // `bonafide` matters here: relatives who live outside the
            // barangay are on the register so families can be recorded, and
            // counting them would overstate the population publicly.
            'registered_residents' => Resident::bonafide()->where('is_active', true)->count(),
            'households' => Household::count(),
            'puroks' => Resident::bonafide()->where('is_active', true)
                ->whereNotNull('zone_purok')
                ->distinct()
                ->count('zone_purok'),
        ]);

        return $this->success($stats, 'Barangay statistics');
    }

    /**
     * Everything the public news page needs, in one call.
     *
     * The page shows three things at once — the chips with their counts, the
     * posts of whichever kind is chosen, and the events still to come. Three
     * requests for one screen is three chances for it to arrive in pieces.
     *
     * Cached for six hours and cleared the moment a post is saved, so the
     * office never has to wait for a page they have just published.
     */
    public function announcements(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $category = (string) $request->query('category', '');
        $key = LandingCache::announcementsKey($page, $category);

        $result = Cache::remember($key, now()->addHours(6), function () use ($category) {
            $query = Announcement::public()->with('creator:id,name');

            if ($category !== '') {
                $query->where('category', $category);
            }

            $posts = $query->orderBy('sort_order')->orderByDesc('published_at')
                /* A tiebreaker, or two posts saved in the same minute swap
                   places in the grid on every reload. */
                ->orderByDesc('id')
                ->paginate(12)->toArray();

            return $posts + [
                'upcoming' => Announcement::public()->with('creator:id,name')
                    ->upcoming()->limit(6)->get(),
                'counts' => Announcement::public()
                    ->selectRaw('category, COUNT(*) as total')
                    ->groupBy('category')->pluck('total', 'category'),
            ];
        });

        return $this->success($result, 'Announcements retrieved');
    }

    /** One published announcement + up to 3 related posts (same category first). */
    public function announcement(Announcement $announcement)
    {
        if ($announcement->status !== 'Published') {
            return $this->error('Announcement not found', 404);
        }

        $announcement->load('creator:id,name');

        $related = Announcement::public()->with('creator:id,name')
            ->where('id', '!=', $announcement->id)
            ->orderByRaw('CASE WHEN category = ? THEN 0 ELSE 1 END', [$announcement->category])
            ->orderBy('sort_order')
            ->orderByDesc('published_at')
            ->limit(3)
            ->get();

        return $this->success([
            'announcement' => $announcement,
            'related' => $related,
        ], 'Announcement retrieved');
    }

    /**
     * Public "Contact Us" form. The message is delivered in-system to every
     * active Main Office staff member (and Admins) via the notification bell.
     */
    /**
     * An appointment asked for by somebody the register has never heard of.
     *
     * Open to the internet, so it is written as if it will be abused: a tight
     * throttle on the route, a phone number that must look like one, a window
     * of office days rather than any date at all, and a status of Pending
     * rather than Scheduled — the barangay decides when, and nobody books a
     * slot in the office diary by filling in a form.
     *
     * Email is optional on purpose. A phone number reaches everybody here; an
     * email address does not, and requiring one would turn people away at the
     * door for the convenience of the desk.
     */
    public function requestAppointment(Request $request)
    {
        $validated = $request->validate([
            'guest_name' => 'required|string|max:150',
            'guest_email' => 'nullable|email|max:150',
            /* 09xxxxxxxxx or +639xxxxxxxxx, which is every mobile in the
               country and nothing else. */
            'guest_contact' => ['required', 'string', 'max:30', 'regex:/^(09|\+639)\d{9}$/'],
            'purpose' => 'required|string|max:300',
            'scheduled_datetime' => 'required|date_format:Y-m-d H:i:s',
        ], [
            'guest_contact.regex' => 'Please give a mobile number as 09XXXXXXXXX.',
        ]);

        $when = CarbonImmutable::parse($validated['scheduled_datetime'], self::MANILA);

        /*
         * A day the office is open, in the near future.
         *
         * Not "any future date": a request for next February is not a request,
         * and a slot at two in the morning is somebody testing the form.
         */
        if ($when->isPast()) {
            return $this->error('Please choose a date and time in the future.', 422);
        }

        if ($when->gt(CarbonImmutable::now(self::MANILA)->addMonths(2))) {
            return $this->error('Please choose a date within the next two months.', 422);
        }

        if ($when->isWeekend()) {
            return $this->error('The barangay hall is open Monday to Friday.', 422);
        }

        if ($when->hour < 8 || $when->hour >= 17) {
            return $this->error('Please choose a time between 8:00 AM and 5:00 PM.', 422);
        }

        /*
         * The same person asking twice for the same day is somebody who
         * pressed the button twice, not somebody who wants two meetings.
         */
        $already = Appointment::where('guest_contact', $validated['guest_contact'])
            ->whereDate('scheduled_datetime', $when->utc()->toDateString())
            ->whereNotIn('status', ['Cancelled'])
            ->exists();

        if ($already) {
            return $this->error('You already have a request for that day. The office will call you about it.', 422);
        }

        $appointment = Appointment::create([
            'appointment_number' => SequenceNumber::next(
                'appointments', 'appointment_number', 'APT-' . date('Y') . '-', 5
            ),
            'guest_name' => $validated['guest_name'],
            'guest_email' => $validated['guest_email'] ?? null,
            'guest_contact' => $validated['guest_contact'],
            'purpose' => $validated['purpose'],
            'office' => self::APPOINTMENT_OFFICE,
            /* Manila in, UTC stored — the same rule the rest of the system
               follows, and the one a form posting wall-clock time breaks. */
            'scheduled_datetime' => $when->utc()->toDateTimeString(),
            /* PENDING. A request, not a booking: the office confirms it. */
            'status' => 'Pending',
        ]);

        /* The desk is told, so a request made at four does not sit unseen. */
        $this->notifyOffice($appointment);

        return $this->success([
            'appointment_number' => $appointment->appointment_number,
        ], 'Your request has been received. The barangay will call you to confirm the time.', 201);
    }

    /**
     * Every visitor appointment is with the Barangay Secretary.
     *
     * The form used to ask which office, which asked somebody outside the
     * barangay to know how it is organised — and sent them to a desk that may
     * not be the one they need. The Secretary keeps the diary and refers on
     * from there, which is what happens at the counter anyway.
     *
     * The column holds the OFFICE because that is what gates the appointments
     * screen; the role below is what decides who is told.
     */
    private const APPOINTMENT_OFFICE = 'Main Office';
    private const APPOINTMENT_ROLE = 'Secretary';

    private function notifyOffice(Appointment $appointment): void
    {
        /*
         * The Secretary keeps the diary, and the Punong Barangay oversees it.
         * Not the Clerk: certificates are their work, and a request for a
         * meeting is not one.
         */
        $ids = User::where('is_active', true)
            ->whereIn('role', [self::APPOINTMENT_ROLE, 'Punong Barangay'])
            ->pluck('id');

        Notification::notifyUsers(
            $ids,
            'appointment_request',
            'Appointment request: ' . $appointment->guest_name,
            Str::limit($appointment->purpose, 140),
            'appointment',
            $appointment->id,
        );
    }

    public function contact(Request $request)
    {
        $validated = $request->validate([
            'full_name' => 'required|string|max:120',
            'email' => 'required|email|max:150',
            'phone' => 'nullable|string|max:30',
            'subject' => 'required|string|max:150',
            'message' => 'required|string|max:2000',
        ]);

        $recipients = \App\Models\User::where('is_active', true)
            ->where(function ($query) {
                $query->where('office', 'Main Office')->orWhere('role', 'Admin');
            })
            ->pluck('id');

        $body = $validated['message']
            . "\n\nFrom: " . $validated['full_name'] . ' · ' . $validated['email']
            . (!empty($validated['phone']) ? ' · ' . $validated['phone'] : '');

        foreach ($recipients as $userId) {
            \App\Models\Notification::create([
                'user_id' => $userId,
                'notification_type' => 'website_inquiry',
                'subject' => 'Website inquiry: ' . $validated['subject'],
                'message' => $body,
                'channel' => 'In-System',
                'is_sent' => true,
                'sent_at' => now(),
            ]);
        }

        return $this->success(null, 'Message received — the barangay office will get back to you.');
    }

    /**
     * AI-assisted resident inquiry (Shared Core module 4).
     * Currently a rule-based search over the service_guides knowledge base;
     * an LLM can be plugged in here later without changing the contract.
     */
    public function assistantInquiry(Request $request)
    {
        $validated = $request->validate([
            'message' => 'required|string|max:500',
        ]);

        $terms = collect(preg_split('/[^a-z0-9]+/i', Str::lower($validated['message'])))
            ->filter(fn ($t) => strlen($t) >= 3)
            ->unique()
            ->values();

        $guides = ServiceGuide::where('is_active', true)->get();

        $scored = $guides->map(function ($guide) use ($terms) {
            $haystack = Str::lower(implode(' ', [
                $guide->service_name,
                $guide->description,
                $guide->keywords,
                $guide->office,
            ]));

            $score = $terms->sum(fn ($term) => substr_count($haystack, $term));

            return ['guide' => $guide, 'score' => $score];
        })->filter(fn ($row) => $row['score'] > 0)
          ->sortByDesc('score')
          ->take(3)
          ->values();

        if ($scored->isEmpty()) {
            return $this->success([
                'answer' => 'I could not match your question to a specific service. '
                    . 'You may visit the Barangay Main Office (Mon–Fri, 8:00 AM–5:00 PM) '
                    . 'or browse the offices: Main Office, VAWC Desk, Lupon Tagapamayapa, '
                    . 'Population Office, and the Health Station.',
                'matches' => [],
            ], 'Assistant response');
        }

        $top = $scored->first()['guide'];

        $answer = sprintf(
            "For \"%s\", please proceed to the %s.\n\nRequirements: %s\nFees: %s\nSchedule: %s",
            $top->service_name,
            $top->office,
            $top->requirements ?: 'None listed',
            $top->fees ?: 'Free',
            $top->schedule ?: 'Mon–Fri, 8:00 AM–5:00 PM'
        );

        return $this->success([
            'answer' => $answer,
            'matches' => $scored->map(fn ($row) => $row['guide']),
        ], 'Assistant response');
    }
}
