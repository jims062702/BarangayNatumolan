<?php

namespace App\Http\Controllers\Api;

use App\Support\SequenceNumber;

use App\Models\VawcAccessLog;
use App\Models\VawcCase;
use App\Models\VawcDocument;
use App\Models\VawcFollowup;
use App\Models\VawcIncident;
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
            // The person who brought the complaint. Not required to be a
            // resident — only the survivor is. Blank means the survivor
            // reported it herself.
            'reported_by_name' => 'nullable|string|max:150',
            'reported_by_relationship' => 'nullable|string|max:100',
            'reported_by_contact' => 'nullable|string|max:50',
            'violence_type' => 'required|in:Physical,Psychological,Economic,Sexual,Mixed',
            'relationship_to_offender' => 'nullable|string',
            'children_involved' => 'boolean',
            'children_count' => 'integer|min:0',
            // Which residents the dependents are. The count is derived from
            // this, never typed, so the two can never disagree.
            'dependent_ids' => 'nullable|array',
            'dependent_ids.*' => 'integer|exists:residents,id',
            'children_details' => 'nullable|string',
            'immediate_needs' => 'nullable|string',
            'previous_incidents_count' => 'integer|min:0',
            'confidential_notes' => 'nullable|string',
            'incident_narrative' => 'nullable|string',
            // A case is often encoded after the fact, so the desk may set the
            // actual date and time the complaint was made — never the future.
            'report_date' => 'nullable|date|before_or_equal:' . self::manilaNow(),
        ], [
            'report_date.before_or_equal' => 'The complaint cannot be reported in the future.',
        ]);

        $narrative = $validated['incident_narrative'] ?? null;
        unset($validated['incident_narrative']);

        $dependentIds = collect($validated['dependent_ids'] ?? [])->unique()->values();
        unset($validated['dependent_ids']);
        // The count always mirrors who was actually picked.
        $validated['children_count'] = $dependentIds->count();
        $validated['children_involved'] = $dependentIds->isNotEmpty();

        $validated['case_code'] = $this->generateCaseCode();
        $validated['report_date'] = $validated['report_date'] ?? now();
        $validated['assigned_vawc_officer'] = auth()->id();

        $case = VawcCase::create($validated);
        $case->dependents()->sync($dependentIds);

        if ($narrative) {
            $case->incidents()->create([
                'incident_narrative' => $narrative,
                'is_confidential' => true,
            ]);
        }

        VawcAccessLog::record($case->id, 'created', 'Case intake');

        return $this->success($case->load('dependents:id,first_name,middle_name,last_name,resident_number'), 'VAWC case created', 201);
    }

    public function show(VawcCase $case)
    {
        $case->load(['survivor:id,first_name,last_name,zone_purok,contact_number', 'dependents:id,first_name,middle_name,last_name,resident_number', 'officer:id,name', 'incidents', 'referrals', 'followups.recorder:id,name', 'documents.uploader:id,name']);

        VawcAccessLog::record($case->id, 'viewed', 'Full case viewed');

        return $this->success($case, 'VAWC case retrieved');
    }

    public function update(Request $request, VawcCase $case)
    {
        $validated = $request->validate([
            // A mis-picked survivor has to be correctable, or the case has to
            // be deleted and re-filed — losing the whole audit trail with it.
            'survivor_id' => 'sometimes|exists:residents,id',
            'reported_by_name' => 'nullable|string|max:150',
            'reported_by_relationship' => 'nullable|string|max:100',
            'reported_by_contact' => 'nullable|string|max:50',
            'violence_type' => 'in:Physical,Psychological,Economic,Sexual,Mixed',
            'relationship_to_offender' => 'nullable|string',
            'children_involved' => 'boolean',
            'children_count' => 'integer|min:0',
            'dependent_ids' => 'nullable|array',
            'dependent_ids.*' => 'integer|exists:residents,id',
            'children_details' => 'nullable|string',
            'immediate_needs' => 'nullable|string',
            'previous_incidents_count' => 'integer|min:0',
            'confidential_notes' => 'nullable|string',
            'status' => 'in:Active,Closed,Archived',
        ]);

        // Re-pointing a case at a different person is the single most
        // sensitive edit here, so it is named explicitly in the trail.
        if (array_key_exists('survivor_id', $validated) && $validated['survivor_id'] !== $case->survivor_id) {
            VawcAccessLog::record($case->id, 'survivor_changed', 'Survivor record re-linked');
        }

        if (($validated['status'] ?? null) === 'Closed' && $case->status !== 'Closed') {
            $validated['closed_at'] = now();
        }

        if (array_key_exists('dependent_ids', $validated)) {
            $dependentIds = collect($validated['dependent_ids'] ?? [])->unique()->values();
            $case->dependents()->sync($dependentIds);
            $validated['children_count'] = $dependentIds->count();
            $validated['children_involved'] = $dependentIds->isNotEmpty();
        }
        unset($validated['dependent_ids']);

        $case->update($validated);

        VawcAccessLog::record($case->id, 'updated', 'Case fields updated');

        return $this->success($case->load('dependents:id,first_name,middle_name,last_name,resident_number'), 'VAWC case updated');
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

    /**
     * Correct a document's particulars — its type, title, description or the
     * file reference locating the physical copy. The document itself is never
     * replaced here, and the change is written to the access trail.
     */
    public function updateDocument(Request $request, VawcDocument $document)
    {
        $validated = $request->validate([
            'document_type' => 'sometimes|in:Affidavit,Statement,Medical Certificate,Police Report,Photograph,Protection Order,Other',
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'file_reference' => 'nullable|string|max:255',
        ]);

        $document->update($validated);

        VawcAccessLog::record($document->vawc_case_id, 'document_updated', $document->title);

        $document->load(['vawcCase:id,case_code,violence_type,status', 'uploader:id,name']);

        return $this->success($document, 'Document updated');
    }

    public function accessLogs(VawcCase $case)
    {
        return $this->success(
            $case->accessLogs()->with('user:id,name')->latest()->paginate(50),
            'Access logs retrieved'
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Desk-wide worklists
    |--------------------------------------------------------------------------
    | The lists below span every case so the officer can work by task
    | (referrals owed a response, follow-ups due) instead of opening cases one
    | at a time. They carry the case CODE only — never the survivor's name.
    | Opening the case itself is what writes a `viewed` entry to the trail.
    */

    /** 2.5 — every referral across the desk, with its response state. */
    public function deskReferrals(Request $request)
    {
        $query = VawcReferral::with('vawcCase:id,case_code,violence_type,status');

        if ($request->filled('referral_agency')) {
            $query->where('referral_agency', $request->referral_agency);
        }

        if ($request->filled('state')) {
            match ($request->state) {
                'Completed' => $query->where('is_completed', true),
                'Awaiting acknowledgment' => $query->whereNull('acknowledgment_date')->where('is_completed', false),
                'In progress' => $query->whereNotNull('acknowledgment_date')->where('is_completed', false),
                default => null,
            };
        }

        // Referrals whose agreed follow-up date has arrived and that are
        // still open — the chase list.
        if ($request->boolean('due')) {
            $query->whereNotNull('followup_schedule')
                ->whereDate('followup_schedule', '<=', today())
                ->where('is_completed', false);
        }

        return $this->success(
            $query->orderBy('referral_date', 'desc')->orderBy('id', 'desc')->paginate(20),
            'VAWC referrals retrieved'
        );
    }

    /** Update a referral from the desk-wide list (no case id in the path). */
    public function updateDeskReferral(Request $request, VawcReferral $referral)
    {
        $validated = $request->validate([
            'acknowledgment_date' => 'nullable|date',
            'outcome' => 'nullable|string',
            'followup_schedule' => 'nullable|date',
            'is_completed' => 'boolean',
        ]);

        $referral->update($validated);

        VawcAccessLog::record($referral->vawc_case_id, 'referral_updated', 'Referral #' . $referral->id);

        $referral->load('vawcCase:id,case_code,violence_type,status');

        return $this->success($referral, 'Referral updated');
    }

    /** 2.6 — intervention monitoring across every open case. */
    public function deskFollowups(Request $request)
    {
        $query = VawcFollowup::with(['vawcCase:id,case_code,violence_type,status', 'recorder:id,name']);

        if ($request->filled('safety_status')) {
            $query->where('safety_status', $request->safety_status);
        }

        if ($request->filled('bpo_compliance')) {
            $query->where('bpo_compliance', $request->bpo_compliance);
        }

        if ($request->boolean('closure_recommended')) {
            $query->where('closure_recommended', true);
        }

        // Only visits whose next check-in is already due, on cases still open.
        if ($request->boolean('due')) {
            $query->whereNotNull('next_followup_date')
                ->whereDate('next_followup_date', '<=', today())
                ->whereHas('vawcCase', fn ($q) => $q->where('status', 'Active'));
        }

        return $this->success(
            $query->orderBy('followup_date', 'desc')->orderBy('id', 'desc')->paginate(20),
            'VAWC follow-ups retrieved'
        );
    }

    /** 2.4 — the confidential document register across every case. */
    public function deskDocuments(Request $request)
    {
        $query = VawcDocument::with(['vawcCase:id,case_code,violence_type,status', 'uploader:id,name']);

        if ($request->filled('document_type')) {
            $query->where('document_type', $request->document_type);
        }

        return $this->success(
            $query->latest()->paginate(20),
            'VAWC documents retrieved'
        );
    }

    /** 2.4 — the complete access trail, every case, newest first. */
    public function deskAccessLogs(Request $request)
    {
        $query = VawcAccessLog::with(['vawcCase:id,case_code', 'user:id,name']);

        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        return $this->success(
            $query->latest()->paginate(50),
            'Access trail retrieved'
        );
    }

    /**
     * Anonymized statistics — this is the ONLY VAWC data other dashboards
     * may consume (no personally identifiable survivor information).
     */
    public function getStatistics(Request $request)
    {
        $year = $request->input('year', date('Y'));

        // Current safety picture = the LATEST follow-up on each case, not
        // every visit ever recorded (older visits describe a past state).
        $latestIds = VawcFollowup::selectRaw('MAX(id) as id')->groupBy('vawc_case_id')->pluck('id');
        $latest = VawcFollowup::whereIn('id', $latestIds)
            ->with('vawcCase:id,status')
            ->get();
        $latestOnActive = $latest->filter(fn ($f) => $f->vawcCase?->status === 'Active');

        return $this->success([
            'total_cases_active' => VawcCase::where('status', 'Active')->count(),
            'total_cases_year' => VawcCase::whereYear('report_date', $year)->count(),
            'cases_by_violence_type' => VawcCase::whereYear('report_date', $year)
                ->groupBy('violence_type')
                ->selectRaw('violence_type, count(*) as count')
                ->get(),
            'referrals_made' => VawcReferral::whereYear('referral_date', $year)->count(),
            'referrals_acknowledged' => VawcReferral::whereYear('referral_date', $year)
                ->whereNotNull('acknowledgment_date')->count(),
            'cases_with_children' => VawcCase::where('children_involved', true)->whereYear('report_date', $year)->count(),
            'pending_followups' => VawcFollowup::whereDate('next_followup_date', '>=', today())->count(),
            'overdue_followups' => $latestOnActive
                ->filter(fn ($f) => $f->next_followup_date && $f->next_followup_date->isPast())
                ->count(),
            'protection_orders_issued' => VawcIncident::where('protection_order_filed', true)
                ->whereYear('created_at', $year)->count(),
            'documents_on_file' => VawcDocument::whereYear('created_at', $year)->count(),
            'closure_recommended' => $latestOnActive->where('closure_recommended', true)->count(),
            // Anonymized service picture across open cases.
            'safety_status' => $latestOnActive->groupBy('safety_status')->map->count(),
            'bpo_compliance' => $latestOnActive->groupBy('bpo_compliance')->map->count(),
            'average_response_days' => $this->averageResponseDays($year),
        ], 'VAWC statistics retrieved');
    }

    /**
     * Service response time: days from intake to the first protective action
     * taken on the case (a referral or a follow-up visit, whichever came
     * first). Cases with no action yet are excluded so one untouched case
     * cannot masquerade as a fast average.
     */
    private function averageResponseDays(string|int $year): float
    {
        $cases = VawcCase::whereYear('report_date', $year)
            ->with(['referrals:id,vawc_case_id,referral_date', 'followups:id,vawc_case_id,followup_date'])
            ->get();

        $spans = $cases->map(function ($case) {
            $first = collect([
                $case->referrals->min('referral_date'),
                $case->followups->min('followup_date'),
            ])->filter()->min();

            return $first ? $case->report_date->diffInDays($first) : null;
        })->filter(fn ($days) => $days !== null);

        return $spans->isEmpty() ? 0 : round($spans->avg(), 1);
    }

    /** VAWC-2026-0001 — one above the highest ever issued. */
    private function generateCaseCode(): string
    {
        return SequenceNumber::next('vawc_cases', 'case_code', 'VAWC-' . date('Y') . '-', 4);
    }
}
