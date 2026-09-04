<?php

namespace App\Http\Controllers\Api;

use App\Models\ServiceRequest;
use App\Models\CertificateClearance;
use App\Models\ChatConversation;
use App\Models\VawcCase;
use App\Models\LuponCase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends BaseController
{
    /**
     * Get dashboard summary
     */
    public function getSummary(Request $request)
    {
        $user = auth()->user();
        
        return $this->success([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'office' => $user->office,
                'role' => $user->role,
            ],
            'quick_stats' => $this->getQuickStats($user),
            'recent_activity' => $this->getRecentActivity($user),
        ], 'Dashboard summary retrieved');
    }

    /**
     * Get pending items for dashboard
     */
    public function getPendingItems(Request $request)
    {
        $user = auth()->user();
        
        $pending = [];
        
        /*
         * Main Office worklists. Both counters used to name statuses the
         * column never held ('Approval', 'Verification'), so they always read
         * zero; they now track the two places work actually piles up:
         * requests nobody has started, and finished documents waiting to be
         * collected.
         */
        if ($user->office === 'Main Office' || $user->role === 'Punong Barangay') {
            $pending['pending_certificates'] = CertificateClearance::where('status', 'Pending')
                ->count();
            $pending['ready_to_claim'] = CertificateClearance::where('status', 'Ready to Claim')
                ->count();
        }
        
        // VAWC active cases
        if ($user->office === 'VAWC') {
            $pending['active_cases'] = VawcCase::where('status', 'Active')
                ->where('assigned_vawc_officer', $user->id)
                ->count();
        }
        
        // Lupon pending hearings
        if ($user->office === 'Lupon') {
            $pending['pending_hearings'] = LuponCase::whereIn('current_stage', ['Mediation', 'Conciliation'])
                ->count();
        }
        
        // Service requests pending assignment
        if (in_array($user->role, ['Secretary', 'Clerk'])) {
            $pending['unassigned_requests'] = ServiceRequest::where('status', 'Pending')
                ->whereNull('assigned_to')
                ->count();
        }
        
        return $this->success($pending, 'Pending items retrieved');
    }


    /**
     * How much work is waiting behind each item in the sidebar.
     *
     * A clerk should not have to open five pages to find out which of them
     * needs them. The number beside a menu item answers that from where they
     * already are, and its absence is just as useful: nothing there, keep
     * going.
     *
     * Keyed by ROUTE, not by module, because the same page appears on several
     * menus — /certificates is on the Clerk's, the Main Office's, the Punong
     * Barangay's and the Admin's — and one count serves all of them.
     *
     * Each figure means the same kind of thing: items in a state that is
     * waiting for somebody in THIS office to act. Not "how many exist" —
     * a badge showing 20 released certificates would be noise on a permanent
     * setting, and a clerk would learn to ignore it within a day.
     *
     * The office gates mirror `menuFor()` on the client and the middleware on
     * the routes. They are not decoration: without them this endpoint would
     * report how many confidential VAWC cases are open to every account in
     * the barangay.
     */
    public function badges(Request $request): JsonResponse
    {
        $user = $request->user();
        $office = $user->office;
        $role = $user->role;

        $isAdmin = $office === 'Admin';
        $frontDesk = $isAdmin || in_array($office, ['Main Office'], true);
        $lupon = $isAdmin || $office === 'Lupon' || $role === 'Punong Barangay';

        $badges = [];

        /*
         * A resident's own menu. Their numbers answer a different question
         * from the staff's — not "what must I do" but "what has happened
         * to my request" — and the most useful of them is a certificate
         * waiting at the hall that nobody has told them about.
         */
        if ($user->resident_id) {
            $mine = $user->resident_id;

            /*
             * Requests and certificates are one page for the resident, so
             * they are one number. What it counts is what is still moving:
             * anything not yet finished, plus a document that is signed and
             * waiting at the counter for them to collect.
             */
            $badges['/portal/requests'] = ServiceRequest::where('resident_id', $mine)
                ->whereNotIn('status', ['Completed', 'Rejected'])
                ->count();

            $badges['/portal/appointments'] = DB::table('appointments')
                ->where('resident_id', $mine)
                ->whereIn('status', ['Scheduled', 'Confirmed'])
                ->where('scheduled_datetime', '>=', now()->startOfDay())
                ->count();

            return $this->success(array_filter($badges), 'Sidebar counts retrieved');
        }

        if ($frontDesk) {
            // Filed and untouched — the intake nobody has picked up.
            $badges['/services'] = ServiceRequest::where('status', 'Pending')->count();

            // Anybody physically at the window right now.
            $badges['/queue'] = DB::table('office_queue')
                ->whereIn('status', ['Waiting', 'Called', 'Serving'])
                ->count();

            /*
             * Everything short of released or cancelled: accepted, printed,
             * signed, waiting to be claimed. All of them are a resident
             * waiting on the office for something.
             */
            $badges['/certificates'] = CertificateClearance::whereNotIn(
                'status',
                ['Released', 'Cancelled']
            )->count();

            // Booked and still ahead of us — a past appointment needs nothing.
            $badges['/appointments'] = DB::table('appointments')
                ->whereIn('status', ['Scheduled', 'Confirmed'])
                ->where('scheduled_datetime', '>=', now()->startOfDay())
                ->count();

            $badges['/referrals'] = DB::table('referrals')
                ->whereIn('status', ['Pending', 'Acknowledged', 'In Progress'])
                ->count();

            // Drafted but not yet adopted by the Punong Barangay.
            $badges['/records'] = DB::table('administrative_records')
                ->whereNull('approved_at')
                ->where('is_archived', false)
                ->count();
        }

        /*
         * The live desk, which the Clerk does not staff. Waiting conversations
         * AND unread replies in the one being handled: both are somebody on
         * the other end of a chat window, watching for an answer.
         */
        if ($frontDesk && $role !== 'Clerk') {
            $badges['/chat'] = ChatConversation::where('status', 'Waiting')->count()
                + (int) ChatConversation::where('status', 'Active')->sum('unread_for_agent');
        }

        if ($lupon) {
            // A case still moving through the KP process.
            $badges['/lupon/cases'] = LuponCase::whereNotIn(
                'current_stage',
                ['Settled', 'Dismissed', 'Referred']
            )->count();

            $badges['/lupon/hearings'] = DB::table('lupon_hearings')
                ->where('status', 'Scheduled')
                ->count();
        }

        // Confidential by law and by design: this number leaves the VAWC desk
        // for nobody, not even the Punong Barangay.
        if ($office === 'VAWC') {
            $badges['/vawc/cases'] = VawcCase::where('status', 'Active')->count();
        }

        if ($isAdmin || $office === 'Population') {
            // Issued but never activated — the resident cannot sign in yet.
            $badges['/population/accounts'] = DB::table('users')
                ->whereNotNull('resident_id')
                ->whereNull('activated_at')
                ->count();
        }

        // Zero is the same as nothing to a reader, and sending it invites the
        // sidebar to draw an empty badge.
        return $this->success(array_filter($badges), 'Sidebar counts retrieved');
    }

    /**
     * Get service statistics
     */
    public function getServiceStatistics(Request $request)
    {
        $month = $request->input('month', date('m'));
        $year = $request->input('year', date('Y'));
        
        $requests = ServiceRequest::whereMonth('created_at', $month)
            ->whereYear('created_at', $year)
            ->get();
        
        $completed = $requests->where('status', 'Completed')->count();
        $pending = $requests->where('status', 'Pending')->count();
        $rejected = $requests->where('status', 'Rejected')->count();
        
        return $this->success([
            'period' => [
                'month' => $month,
                'year' => $year,
            ],
            'total_requests' => $requests->count(),
            'by_status' => [
                'completed' => $completed,
                'pending' => $pending,
                'rejected' => $rejected,
                'in_progress' => $requests->where('status', 'In Progress')->count(),
            ],
            'by_office' => $requests->groupBy('office')->map(fn ($group) => $group->count()),
            'by_service_type' => $requests->groupBy('service_type')->map(fn ($group) => $group->count()),
            'completion_rate' => $requests->count() > 0 
                ? round(($completed / $requests->count()) * 100, 2)
                : 0,
            'average_processing_time' => $this->calculateAverageProcessingTime($requests),
        ], 'Service statistics retrieved');
    }

    /**
     * Punong Barangay executive view (module 1.6): everything waiting on the
     * PB plus the barangay-wide service picture — workload, aging requests,
     * most-requested services and the latest directives.
     */
    public function getExecutiveSummary(Request $request)
    {
        $openStatuses = ['Pending', 'In Progress'];
        $open = ServiceRequest::whereIn('status', $openStatuses)->get();

        // Aging buckets on still-open requests — the PB's early warning that
        // something is stuck at a counter.
        $ageInDays = fn ($r) => $r->created_at->diffInDays(now());
        $aging = [
            '0-3 days' => $open->filter(fn ($r) => $ageInDays($r) <= 3)->count(),
            '4-7 days' => $open->filter(fn ($r) => $ageInDays($r) > 3 && $ageInDays($r) <= 7)->count(),
            '8-14 days' => $open->filter(fn ($r) => $ageInDays($r) > 7 && $ageInDays($r) <= 14)->count(),
            '15+ days' => $open->filter(fn ($r) => $ageInDays($r) > 14)->count(),
        ];
        $oldest = $open->sortBy('created_at')->first();

        return $this->success([
            // Administrative documents the PB has still to adopt.
            'documents_awaiting_signature' => \App\Models\AdministrativeRecord::with('creator:id,name')
                ->whereNull('approved_at')
                ->where('is_archived', false)
                ->orderBy('document_date')
                ->limit(8)
                ->get(['id', 'document_type', 'document_number', 'document_title', 'document_date', 'created_by']),
            'documents_awaiting_count' => \App\Models\AdministrativeRecord::whereNull('approved_at')
                ->where('is_archived', false)
                ->count(),

            // Referrals the barangay owes a follow-up on (VAWC excluded by design).
            'referrals_requiring_action' => \App\Models\Referral::with('resident:id,first_name,last_name')
                ->whereNotNull('followup_date')
                ->whereDate('followup_date', '<=', today())
                ->whereNotIn('status', ['Completed', 'Not Attended'])
                ->orderBy('followup_date')
                ->limit(8)
                ->get(),
            'referrals_action_count' => \App\Models\Referral::whereNotNull('followup_date')
                ->whereDate('followup_date', '<=', today())
                ->whereNotIn('status', ['Completed', 'Not Attended'])
                ->count(),

            // Where the open work is sitting right now.
            'office_workload' => $open->groupBy('office')->map(fn ($group) => [
                'pending' => $group->where('status', 'Pending')->count(),
                'in_progress' => $group->where('status', 'In Progress')->count(),
                'total' => $group->count(),
            ]),

            'aging_requests' => $aging,
            'oldest_open_request' => $oldest ? [
                'request_number' => $oldest->request_number,
                'service_type' => $oldest->service_type,
                'office' => $oldest->office,
                'days_open' => (int) round($ageInDays($oldest)),
            ] : null,

            // What residents actually come in for, this year.
            'frequently_requested' => ServiceRequest::whereYear('created_at', date('Y'))
                ->groupBy('service_type')
                ->selectRaw('service_type, count(*) as count')
                ->orderByDesc('count')
                ->limit(6)
                ->get(),

            'service_statistics' => [
                'open_requests' => $open->count(),
                'completed_this_month' => ServiceRequest::where('status', 'Completed')
                    ->whereMonth('created_at', date('m'))
                    ->whereYear('created_at', date('Y'))
                    ->count(),
                'certificates_released_this_month' => CertificateClearance::where('status', 'Released')
                    ->whereMonth('released_at', date('m'))
                    ->whereYear('released_at', date('Y'))
                    ->count(),
                'residents_served_this_month' => ServiceRequest::whereMonth('created_at', date('m'))
                    ->whereYear('created_at', date('Y'))
                    ->whereNotNull('resident_id')
                    ->distinct('resident_id')
                    ->count('resident_id'),
            ],

            // Executive instructions are filed as EOs/memoranda; announcements
            // are the public-facing side of the same voice.
            'recent_directives' => \App\Models\AdministrativeRecord::whereIn('document_type', ['Executive Order', 'Memorandum'])
                ->whereNotNull('approved_at')
                ->orderByDesc('document_date')
                ->limit(5)
                ->get(['id', 'document_type', 'document_number', 'document_title', 'document_date']),
            'announcements' => \App\Models\Announcement::orderByDesc('created_at')
                ->limit(5)
                ->get(['id', 'title', 'created_at']),
        ], 'Executive summary retrieved');
    }

    private function getQuickStats($user)
    {
        $stats = [];
        
        // General stats
        $stats['pending_requests'] = ServiceRequest::where('status', 'Pending')->count();
        $stats['monthly_certificates'] = CertificateClearance::whereMonth('created_at', date('m'))
            ->whereYear('created_at', date('Y'))
            ->count();
        
        // Office-specific stats
        if ($user->office === 'VAWC') {
            $stats['active_cases'] = VawcCase::where('status', 'Active')->count();
        } elseif ($user->office === 'Lupon') {
            $stats['pending_cases'] = LuponCase::whereIn('current_stage', ['Filed', 'Mediation'])->count();
        } elseif ($user->office === 'Health Station') {
            $stats['today_visits'] = \App\Models\HealthVisit::whereDate('visit_date', today())->count();
        }
        
        return $stats;
    }

    private function getRecentActivity($user)
    {
        $activities = [];
        
        $activities['recent_requests'] = ServiceRequest::where('office', $user->office)
            ->orderBy('created_at', 'desc')
            ->limit(5)
            ->get(['id', 'request_number', 'service_type', 'status', 'created_at']);
        
        return $activities;
    }

    private function calculateAverageProcessingTime($requests)
    {
        $completed = $requests->where('status', 'Completed')
            ->filter(fn ($r) => $r->completed_at)
            ->map(fn ($r) => $r->completed_at->diffInDays($r->created_at));
        
        return $completed->count() > 0 
            ? round($completed->avg(), 1)
            : 0;
    }
}
