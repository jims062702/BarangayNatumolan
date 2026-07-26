<?php

namespace App\Http\Controllers\Api;

use App\Models\VawcAccessLog;
use App\Models\VawcCase;
use App\Models\VawcReferral;
use Illuminate\Http\Request;

/**
 * VAWC Desk subsystem. The whole route group is gated to office:VAWC only —
 * no PB/Admin bypass. Every access to a case is written to vawc_access_logs.
 */
class VawcController extends BaseController
{
    public function index(Request $request)
    {
        $query = VawcCase::with(['officer:id,name'])->where('status', '!=', 'Archived');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('violence_type')) {
            $query->where('violence_type', $request->violence_type);
        }

        $cases = $query->orderBy('report_date', 'desc')->paginate(20);

        return $this->success($cases, 'VAWC cases retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'survivor_id' => 'required|exists:residents,id',
            'violence_type' => 'required|in:Physical,Psychological,Economic,Sexual,Mixed',
            'relationship_to_offender' => 'nullable|string',
            'children_involved' => 'boolean',
            'children_count' => 'integer|min:0',
            'immediate_needs' => 'nullable|string',
            'previous_incidents_count' => 'integer|min:0',
            'confidential_notes' => 'nullable|string',
            'incident_narrative' => 'nullable|string',
        ]);

        $narrative = $validated['incident_narrative'] ?? null;
        unset($validated['incident_narrative']);

        $validated['case_code'] = $this->generateCaseCode();
        $validated['report_date'] = now()->toDateString();
        $validated['assigned_vawc_officer'] = auth()->id();

        $case = VawcCase::create($validated);

        if ($narrative) {
            $case->incidents()->create([
                'incident_narrative' => $narrative,
                'is_confidential' => true,
            ]);
        }

        VawcAccessLog::record($case->id, 'created', 'Case intake');

        return $this->success($case, 'VAWC case created', 201);
    }

    public function show(VawcCase $case)
    {
        $case->load(['survivor:id,first_name,last_name,zone_purok,contact_number', 'officer:id,name', 'incidents', 'referrals', 'followups.recorder:id,name', 'documents.uploader:id,name']);

        VawcAccessLog::record($case->id, 'viewed', 'Full case viewed');

        return $this->success($case, 'VAWC case retrieved');
    }

    public function update(Request $request, VawcCase $case)
    {
        $validated = $request->validate([
            'violence_type' => 'in:Physical,Psychological,Economic,Sexual,Mixed',
            'relationship_to_offender' => 'nullable|string',
            'children_involved' => 'boolean',
            'children_count' => 'integer|min:0',
            'immediate_needs' => 'nullable|string',
            'previous_incidents_count' => 'integer|min:0',
            'confidential_notes' => 'nullable|string',
            'status' => 'in:Active,Closed,Archived',
        ]);

        if (($validated['status'] ?? null) === 'Closed' && $case->status !== 'Closed') {
            $validated['closed_at'] = now();
        }

        $case->update($validated);

        VawcAccessLog::record($case->id, 'updated', 'Case fields updated');

        return $this->success($case, 'VAWC case updated');
    }

    public function addIncident(Request $request, VawcCase $case)
    {
        $validated = $request->validate([
            'incident_narrative' => 'required|string',
            'injury_documentation' => 'nullable|string',
            'medical_certificate_reference' => 'nullable|string',
            'police_report_reference' => 'nullable|string',
            'protection_order_filed' => 'boolean',
            'attachments_notes' => 'nullable|string',
        ]);

        $incident = $case->incidents()->create($validated + ['is_confidential' => true]);

        VawcAccessLog::record($case->id, 'incident_added');

        return $this->success($incident, 'Incident recorded', 201);
    }

    public function createReferral(Request $request, VawcCase $case)
    {
        $validated = $request->validate([
            'referral_agency' => 'required|in:PNP WCPD,DSWD,Rural Health Unit,Hospital,Prosecutor,Public Attorney,Shelter,Counseling Service,Child Protection,Other',
            'receiving_person' => 'nullable|string',
            'services_requested' => 'required|string',
            'followup_schedule' => 'nullable|date',
        ]);

        $referral = $case->referrals()->create($validated + [
            'referral_date' => now()->toDateString(),
        ]);

        VawcAccessLog::record($case->id, 'referral_added', $validated['referral_agency']);

        return $this->success($referral, 'Referral created', 201);
    }

    public function updateReferral(Request $request, VawcCase $case, VawcReferral $referral)
    {
        if ($referral->vawc_case_id !== $case->id) {
            return $this->notFound('Referral does not belong to this case');
        }

        $validated = $request->validate([
            'acknowledgment_date' => 'nullable|date',
            'outcome' => 'nullable|string',
            'followup_schedule' => 'nullable|date',
            'is_completed' => 'boolean',
        ]);

        $referral->update($validated);

        VawcAccessLog::record($case->id, 'referral_updated', 'Referral #' . $referral->id);

        return $this->success($referral, 'Referral updated');
    }

    public function recordFollowup(Request $request, VawcCase $case)
    {
        $validated = $request->validate([
            'followup_date' => 'required|date',
            'followup_type' => 'required|in:Home Visit,Office Visit,Phone Call',
            'safety_status' => 'required|in:Safe,At Risk,Critical,Unknown',
            'bpo_compliance' => 'in:Compliant,Violated,No BPO',
            'referral_attended' => 'nullable|boolean',
            'services_received' => 'nullable|string',
            'notes' => 'nullable|string',
            'next_followup_date' => 'nullable|date',
            'closure_recommended' => 'boolean',
        ]);

        $followup = $case->followups()->create($validated + ['recorded_by' => auth()->id()]);

        VawcAccessLog::record($case->id, 'followup_recorded', $validated['safety_status']);

        return $this->success($followup, 'Follow-up recorded', 201);
    }

    public function getDocuments(VawcCase $case)
    {
        VawcAccessLog::record($case->id, 'documents_viewed');

        return $this->success([
            'documents' => $case->documents()->with('uploader:id,name')->latest()->get(),
            'incidents' => $case->incidents,
        ], 'Documents retrieved');
    }

    public function addDocument(Request $request, VawcCase $case)
    {
        $validated = $request->validate([
            'document_type' => 'required|in:Affidavit,Statement,Medical Certificate,Police Report,Photograph,Protection Order,Other',
            'title' => 'required|string',
            'description' => 'nullable|string',
            'file_reference' => 'nullable|string',
        ]);

        $document = $case->documents()->create($validated + ['uploaded_by' => auth()->id()]);

        VawcAccessLog::record($case->id, 'document_added', $validated['title']);

        return $this->success($document, 'Document recorded', 201);
    }

    public function accessLogs(VawcCase $case)
    {
        return $this->success(
            $case->accessLogs()->with('user:id,name')->latest()->paginate(50),
            'Access logs retrieved'
        );
    }

    /**
     * Anonymized statistics — this is the ONLY VAWC data other dashboards
     * may consume (no personally identifiable survivor information).
     */
    public function getStatistics(Request $request)
    {
        $year = $request->input('year', date('Y'));

        return $this->success([
            'total_cases_active' => VawcCase::where('status', 'Active')->count(),
            'total_cases_year' => VawcCase::whereYear('report_date', $year)->count(),
            'cases_by_violence_type' => VawcCase::whereYear('report_date', $year)
                ->groupBy('violence_type')
                ->selectRaw('violence_type, count(*) as count')
                ->get(),
            'referrals_made' => VawcReferral::whereYear('referral_date', $year)->count(),
            'cases_with_children' => VawcCase::where('children_involved', true)->whereYear('report_date', $year)->count(),
            'pending_followups' => \App\Models\VawcFollowup::whereDate('next_followup_date', '>=', today())->count(),
        ], 'VAWC statistics retrieved');
    }

    private function generateCaseCode(): string
    {
        $year = date('Y');
        $count = VawcCase::whereYear('created_at', $year)->count() + 1;

        return 'VAWC-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
    }
}
