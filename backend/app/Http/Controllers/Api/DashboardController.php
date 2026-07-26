<?php

namespace App\Http\Controllers\Api;

use App\Models\ServiceRequest;
use App\Models\CertificateClearance;
use App\Models\VawcCase;
use App\Models\LuponCase;
use Illuminate\Http\Request;

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
        
        // Main Office pending certificates
        if ($user->office === 'Main Office' || $user->role === 'Punong Barangay') {
            $pending['pending_certificates'] = CertificateClearance::where('status', 'Approval')
                ->count();
            $pending['pending_approvals'] = CertificateClearance::where('status', 'Verification')
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
