<?php

namespace App\Http\Controllers\Api;

use App\Models\LuponCase;
use App\Models\LuponHearing;
use App\Models\LuponSettlement;
use App\Models\Notification;
use Illuminate\Http\Request;

class LuponController extends BaseController
{
    /**
     * Keyword screen: VAWC and child-abuse matters are OUTSIDE Katarungang
     * Pambarangay jurisdiction and must never enter Lupon mediation.
     */
    private const VAWC_KEYWORDS = [
        'vawc', 'abuse', 'violence against', 'domestic violence', 'battery',
        'batter', 'rape', 'molest', 'maltreat', 'incest', 'trafficking',
        'child abuse', 'lascivious',
    ];

    public function index(Request $request)
    {
        $query = LuponCase::with(['assignedLuponSecretary:id,name', 'complainant:id,first_name,last_name', 'respondent:id,first_name,last_name']);

        if ($request->filled('current_stage')) {
            $query->where('current_stage', $request->current_stage);
        }
        if ($request->filled('jurisdiction_status')) {
            $query->where('jurisdiction_status', $request->jurisdiction_status);
        }

        $cases = $query->orderBy('date_filed', 'desc')->paginate(20);

        return $this->success($cases, 'Lupon cases retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'case_title' => 'required|string',
            'case_classification' => 'required|in:Assault,Theft,Property Damage,Libel,Ejectment,Debt,Family Dispute,Land Dispute,Others',
            'complainant_id' => 'required|exists:residents,id',
            'respondent_id' => 'required|exists:residents,id|different:complainant_id',
            'complaint_narrative' => 'required|string',
            'date_of_occurrence' => 'required|date',
            'place_of_occurrence' => 'required|string',
            'relationship_nature' => 'required|in:Family,Neighbor,Business,Friend,Other',
        ]);

        // Hard block: VAWC / child-abuse matters cannot be docketed here.
        $text = strtolower($validated['case_title'] . ' ' . $validated['complaint_narrative']);
        foreach (self::VAWC_KEYWORDS as $keyword) {
            if (str_contains($text, $keyword)) {
                return $this->error(
                    'This complaint appears to involve violence against women/children. ' .
                    'KP mediation is prohibited for VAWC cases — please route the client to the VAWC Desk immediately.',
                    422,
                    ['routed_to' => 'VAWC']
                );
            }
        }

        $case = LuponCase::create([
            'case_number' => $this->generateCaseNumber(),
            'case_title' => $validated['case_title'],
            'case_classification' => $validated['case_classification'],
            'complainant_id' => $validated['complainant_id'],
            'respondent_id' => $validated['respondent_id'],
            'date_filed' => now()->toDateString(),
            'assigned_lupon_secretary' => auth()->id(),
        ]);

        $case->complaint()->create([
            'complaint_narrative' => $validated['complaint_narrative'],
            'date_of_occurrence' => $validated['date_of_occurrence'],
            'place_of_occurrence' => $validated['place_of_occurrence'],
            'relationship_nature' => $validated['relationship_nature'],
            'complaint_received_date' => now()->toDateString(),
        ]);

        return $this->success($case->load('complaint'), 'Lupon case filed', 201);
    }

    public function show(LuponCase $case)
    {
        $case->load([
            'complaint',
            'assignedLuponSecretary:id,name',
            'complainant:id,first_name,last_name,zone_purok,contact_number',
            'respondent:id,first_name,last_name,zone_purok,contact_number',
            'hearings' => fn ($q) => $q->orderBy('scheduled_at', 'desc'),
            'settlement',
        ]);

        return $this->success($case, 'Lupon case retrieved');
    }

    public function screenJurisdiction(Request $request, LuponCase $case)
    {
        $text = strtolower($case->case_title . ' ' . ($case->complaint->complaint_narrative ?? ''));

        foreach (self::VAWC_KEYWORDS as $keyword) {
            if (str_contains($text, $keyword)) {
                $case->update([
                    'jurisdiction_status' => 'Rejected',
                    'rejection_reason' => 'VAWC/child-abuse case — must be routed to the VAWC Desk (KP mediation prohibited)',
                    'current_stage' => 'Referred',
                ]);

                return $this->success($case, 'Case rejected and flagged for VAWC referral');
            }
        }

        if (!$case->complainant && !$case->respondent) {
            $case->update([
                'jurisdiction_status' => 'Rejected',
                'rejection_reason' => 'Parties are not barangay residents',
            ]);

            return $this->success($case, 'Case rejected - jurisdiction requirement not met');
        }

        $case->update(['jurisdiction_status' => 'Accepted']);

        return $this->success($case, 'Jurisdiction screening complete — case accepted');
    }

    public function scheduleHearing(Request $request, LuponCase $case)
    {
        $validated = $request->validate([
            'hearing_type' => 'required|in:Mediation,Conciliation,Arbitration',
            'scheduled_at' => 'required|date|after:now',
            'summons_issued' => 'boolean',
        ]);

        $hearing = $case->hearings()->create($validated + ['recorded_by' => auth()->id()]);

        if ($case->current_stage === 'Filed' && $validated['hearing_type'] === 'Mediation') {
            $case->update(['current_stage' => 'Mediation']);
        }

        foreach ([$case->complainant_id, $case->respondent_id] as $residentId) {
            Notification::notifyResident(
                $residentId,
                'hearing_scheduled',
                'KP Hearing Scheduled — ' . $case->case_number,
                sprintf('A %s hearing is scheduled on %s at the Barangay Hall. Attendance is required.',
                    strtolower($validated['hearing_type']),
                    date('F j, Y g:i A', strtotime($validated['scheduled_at']))),
                'lupon_case',
                $case->id
            );
        }

        return $this->success($hearing, 'Hearing scheduled', 201);
    }

    public function recordHearingOutcome(Request $request, LuponCase $case, LuponHearing $hearing)
    {
        if ($hearing->lupon_case_id !== $case->id) {
            return $this->notFound('Hearing does not belong to this case');
        }

        $validated = $request->validate([
            'status' => 'required|in:Completed,Rescheduled,Cancelled,No Show',
            'complainant_present' => 'nullable|boolean',
            'respondent_present' => 'nullable|boolean',
            'attendance_notes' => 'nullable|string',
            'proceedings_notes' => 'nullable|string',
            'outcome' => 'nullable|string',
        ]);

        $hearing->update($validated);

        return $this->success($hearing, 'Hearing outcome recorded');
    }

    public function recordMediation(Request $request, LuponCase $case)
    {
        $validated = $request->validate([
            'mediation_date' => 'required|date',
            'attendance' => 'required|in:Both Present,Complainant Only,Respondent Only,Neither',
            'outcome' => 'required|in:Settlement Reached,No Settlement,Rescheduled',
            'proceedings_notes' => 'nullable|string',
        ]);

        $case->hearings()->create([
            'hearing_type' => 'Mediation',
            'scheduled_at' => $validated['mediation_date'],
            'status' => 'Completed',
            'attendance_notes' => $validated['attendance'],
            'proceedings_notes' => $validated['proceedings_notes'] ?? null,
            'outcome' => $validated['outcome'],
            'recorded_by' => auth()->id(),
        ]);

        // Mediation by the Punong Barangay; if it fails, the Pangkat conciliates.
        if ($validated['outcome'] === 'Settlement Reached') {
            $case->update(['current_stage' => 'Settled']);
        } elseif ($validated['outcome'] === 'No Settlement') {
            $case->update(['current_stage' => 'Conciliation']);
        }

        return $this->success($case->fresh(), 'Mediation recorded');
    }

    public function recordConciliation(Request $request, LuponCase $case)
    {
        $validated = $request->validate([
            'conciliation_date' => 'required|date',
            'pangkat_members' => 'required|array|min:3',
            'outcome' => 'required|in:Settlement,Arbitration,Dismissed',
            'proceedings_notes' => 'nullable|string',
        ]);

        $case->hearings()->create([
            'hearing_type' => 'Conciliation',
            'scheduled_at' => $validated['conciliation_date'],
            'status' => 'Completed',
            'attendance_notes' => 'Pangkat: ' . implode(', ', $validated['pangkat_members']),
            'proceedings_notes' => $validated['proceedings_notes'] ?? null,
            'outcome' => $validated['outcome'],
            'recorded_by' => auth()->id(),
        ]);

        if ($validated['outcome'] === 'Settlement') {
            $case->update(['current_stage' => 'Settled']);
        } elseif ($validated['outcome'] === 'Arbitration') {
            $case->update(['current_stage' => 'Arbitration']);
        } else {
            $case->update(['current_stage' => 'Dismissed', 'date_resolved' => now()->toDateString()]);
        }

        return $this->success($case->fresh(), 'Conciliation recorded');
    }

    public function recordSettlement(Request $request, LuponCase $case)
    {
        if ($case->settlement) {
            return $this->error('A settlement is already recorded for this case', 409);
        }

        $validated = $request->validate([
            'settlement_type' => 'required|in:Amicable Settlement,Arbitration Award',
            'terms' => 'required|string',
            'date_agreed' => 'required|date',
            'compliance_deadline' => 'nullable|date|after:date_agreed',
        ]);

        // KP Law: parties may repudiate within 10 days; after that it is final.
        $settlement = $case->settlement()->create($validated + [
            'repudiation_deadline' => date('Y-m-d', strtotime($validated['date_agreed'] . ' +10 days')),
            'recorded_by' => auth()->id(),
        ]);

        $case->update([
            'current_stage' => 'Settled',
            'date_resolved' => $validated['date_agreed'],
        ]);

        return $this->success($settlement, 'Settlement recorded — 10-day repudiation period started', 201);
    }

    public function settlementAction(Request $request, LuponCase $case)
    {
        $settlement = $case->settlement;
        if (!$settlement) {
            return $this->notFound('No settlement recorded for this case');
        }

        $validated = $request->validate([
            'action' => 'required|in:finalize,repudiate,mark_complied,mark_not_complied,execute,issue_cfa,issue_cba',
            'notes' => 'nullable|string',
        ]);

        switch ($validated['action']) {
            case 'finalize':
                $settlement->update(['status' => 'Final']);
                break;
            case 'repudiate':
                if (today()->gt($settlement->repudiation_deadline)) {
                    return $this->error('Repudiation period has lapsed — settlement is final', 422);
                }
                $settlement->update(['status' => 'Repudiated']);
                $case->update(['current_stage' => 'Conciliation']);
                break;
            case 'mark_complied':
                $settlement->update(['status' => 'Complied', 'compliance_notes' => $validated['notes'] ?? null, 'closed_at' => now()]);
                break;
            case 'mark_not_complied':
                $settlement->update(['status' => 'Not Complied', 'compliance_notes' => $validated['notes'] ?? null]);
                break;
            case 'execute':
                $settlement->update(['status' => 'Executed', 'compliance_notes' => $validated['notes'] ?? null]);
                break;
            case 'issue_cfa':
                $settlement->update(['cfa_issued' => true, 'cfa_issued_at' => now()]);
                $case->update(['current_stage' => 'Referred', 'notes' => 'Certificate to File Action issued']);
                break;
            case 'issue_cba':
                $settlement->update(['cba_issued' => true, 'cba_issued_at' => now()]);
                break;
        }

        return $this->success($settlement->fresh(), 'Settlement updated');
    }

    /**
     * Dashboard alerts: upcoming hearings + settlements still inside the
     * 10-day repudiation window (lapsed ones are auto-finalized here).
     */
    public function deadlines()
    {
        LuponSettlement::where('status', 'Within Repudiation Period')
            ->whereDate('repudiation_deadline', '<', today())
            ->update(['status' => 'Final']);

        return $this->success([
            'upcoming_hearings' => LuponHearing::with('luponCase:id,case_number,case_title')
                ->where('status', 'Scheduled')
                ->where('scheduled_at', '>=', now())
                ->orderBy('scheduled_at')
                ->limit(10)
                ->get(),
            'repudiation_window' => LuponSettlement::with('luponCase:id,case_number,case_title')
                ->where('status', 'Within Repudiation Period')
                ->orderBy('repudiation_deadline')
                ->get(),
            'pending_compliance' => LuponSettlement::with('luponCase:id,case_number,case_title')
                ->whereIn('status', ['Final', 'Not Complied'])
                ->whereNotNull('compliance_deadline')
                ->orderBy('compliance_deadline')
                ->get(),
        ], 'Lupon deadlines retrieved');
    }

    /**
     * Structured payloads for the prescribed KP forms (rendered/printed
     * by the frontend).
     */
    public function generateForms(LuponCase $case)
    {
        $case->load(['complaint', 'complainant', 'respondent', 'settlement', 'hearings']);

        return $this->success([
            'case' => $case,
            'forms' => [
                ['code' => 'KP-7', 'name' => 'Notice of Hearing (Mediation)'],
                ['code' => 'KP-9', 'name' => 'Summons'],
                ['code' => 'KP-16', 'name' => 'Amicable Settlement'],
                ['code' => 'KP-20', 'name' => 'Certificate to File Action'],
                ['code' => 'KP-21', 'name' => 'Certificate to Bar Action'],
            ],
        ], 'KP form data generated');
    }

    public function generateMonthlyReport(Request $request)
    {
        $month = $request->input('month', date('m'));
        $year = $request->input('year', date('Y'));

        $cases = LuponCase::whereMonth('date_filed', $month)
            ->whereYear('date_filed', $year)
            ->get();

        return $this->success([
            'month' => $month,
            'year' => $year,
            'cases_filed' => $cases->count(),
            'cases_settled' => $cases->where('current_stage', 'Settled')->count(),
            'cases_dismissed' => $cases->where('current_stage', 'Dismissed')->count(),
            'cases_referred' => $cases->where('current_stage', 'Referred')->count(),
            'hearings_held' => LuponHearing::whereMonth('scheduled_at', $month)
                ->whereYear('scheduled_at', $year)
                ->where('status', 'Completed')
                ->count(),
            'settlement_rate' => $cases->count() > 0
                ? round(($cases->where('current_stage', 'Settled')->count() / $cases->count()) * 100, 2)
                : 0,
        ], 'Monthly transmittal report generated');
    }

    private function generateCaseNumber(): string
    {
        $year = date('Y');
        $count = LuponCase::whereYear('date_filed', $year)->count() + 1;

        return 'KP-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
    }
}
