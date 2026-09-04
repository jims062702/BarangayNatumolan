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

    /** Published announcements. Cached per page+category. */
    public function announcements(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $category = (string) $request->query('category', '');
        $key = LandingCache::announcementsKey($page, $category);

        $result = Cache::remember($key, now()->addHours(6), function () use ($category) {
            $query = Announcement::where('is_published', true);

            if ($category !== '') {
                $query->where('category', $category);
            }

            return $query->orderBy('sort_order')->orderByDesc('published_at')
                ->paginate(10)->toArray();
        });

        return $this->success($result, 'Announcements retrieved');
    }

    /** One published announcement + up to 3 related posts (same category first). */
    public function announcement(Announcement $announcement)
    {
        if (!$announcement->is_published) {
            return $this->error('Announcement not found', 404);
        }

        $related = Announcement::where('is_published', true)
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
