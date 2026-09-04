<?php

namespace App\Http\Controllers\Api;

use App\Support\SequenceNumber;

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

    /** Compliance/execution transitions available on a recorded settlement. */
    private const SETTLEMENT_ACTIONS = [
        'finalize', 'repudiate', 'mark_complied', 'mark_not_complied',
        'execute', 'issue_cfa', 'issue_cba',
    ];

    /**
     * Eager-load spec for any list that shows a case alongside its parties.
     *
     * The complainant columns are NOT optional: `complainant_display_name`
     * and `complainant_is_resident` are computed from `complainant_id` and
     * `complainant_name`, so omitting them from the select makes every case
     * look like it has no complainant — and hides non-resident filers
     * entirely. Kept in one place so the lists cannot drift apart again.
     */
    private const CASE_WITH_PARTIES = [
        'luponCase:id,case_number,case_title,case_classification,current_stage,jurisdiction_status,complainant_id,complainant_name,complainant_address,complainant_contact',
        'luponCase.complainant:id,first_name,middle_name,last_name',
        'luponCase.respondents:id,first_name,middle_name,last_name',
    ];

    public function index(Request $request)
    {
        // `settlement` is loaded so the docket can tell a case whose terms are
        // still unrecorded from one already under compliance monitoring —
        // reaching a settlement at mediation advances the stage but does not
        // by itself write the settlement.
        $query = LuponCase::with([
            'assignedLuponSecretary:id,name',
            'complainant:id,resident_number,first_name,middle_name,last_name,suffix,zone_purok,address,contact_number,household_id',
            'complainant.household:id,household_number,street_address',
            'respondents:id,first_name,last_name',
            'settlement:id,lupon_case_id,status',
        ]);

        if ($request->filled('current_stage')) {
            $query->where('current_stage', $request->current_stage);
        }
        if ($request->filled('jurisdiction_status')) {
            $query->where('jurisdiction_status', $request->jurisdiction_status);
        }

        // Newest case first, and always in case-number sequence: numbers are
        // issued in order, so id order is case-number order. Ordering by
        // date_filed alone left cases filed on the same day unsorted.
        $cases = $query->orderByDesc('id')->paginate(20);

        return $this->success($cases, 'Lupon cases retrieved');
    }

    public function store(Request $request)
    {
        /*
         * KP venue follows the respondent's residence, so the respondent must
         * be one of ours — but the complainant need not be. Either a registry
         * link OR an external name is required, never neither.
         */
        $validated = $request->validate([
            'case_title' => 'required|string',
            'case_classification' => 'required|in:Assault,Theft,Property Damage,Libel,Ejectment,Debt,Family Dispute,Land Dispute,Others',
            'complainant_id' => 'nullable|required_without:complainant_name|exists:residents,id',
            'complainant_name' => 'nullable|required_without:complainant_id|string|max:150',
            'complainant_address' => 'nullable|string|max:255',
            'complainant_contact' => 'nullable|string|max:50',
            'respondent_ids' => 'required|array|min:1',
            'respondent_ids.*' => 'integer|exists:residents,id',
            'complaint_narrative' => 'required|string',
            'date_of_occurrence' => 'required|date',
            'place_of_occurrence' => 'required|string',
            'relationship_nature' => 'required|in:Family,Neighbor,Business,Friend,Other',
        ], [
            'complainant_id.required_without' => 'Select the complainant from the registry, or enter their name if they are not a barangay resident.',
            'complainant_name.required_without' => 'Enter the complainant’s name, or pick them from the registry.',
            'respondent_ids.required' => 'Name at least one respondent. Each must be a barangay resident — that is what gives the Lupon jurisdiction.',
        ]);

        $respondentIds = collect($validated['respondent_ids'])->unique()->values();
        unset($validated['respondent_ids']);

        // Nobody can be on both sides of the same dispute.
        if (!empty($validated['complainant_id']) && $respondentIds->contains($validated['complainant_id'])) {
            return $this->error(
                'The complainant cannot also be a respondent in the same case.',
                422,
                ['respondent_ids' => ['Remove the complainant from the respondents.']]
            );
        }

        /*
         * The rule the whole docket rests on, and until now only promised.
         *
         * `exists:residents,id` lets a NON-RESIDENT through: they are rows in
         * the same table, put there so families could be recorded whole. But
         * Katarungang Pambarangay jurisdiction follows where the RESPONDENT
         * lives — a case against somebody in another barangay is not this
         * Lupon's to hear, and mediating it produces a settlement no court
         * will honour.
         *
         * The complainant is deliberately not checked: a person wronged by a
         * resident may complain whoever they are and wherever they live.
         */
        $outsiders = \App\Models\Resident::whereIn('id', $respondentIds)
            ->where('record_type', \App\Models\Resident::NON_RESIDENT)
            ->pluck('first_name')
            ->all();

        if ($outsiders !== []) {
            return $this->error(
                implode(', ', $outsiders) . ' ' . (count($outsiders) === 1 ? 'is' : 'are')
                    . ' recorded as living outside Barangay Natumolan. The Lupon can only '
                    . 'hear a case whose respondent lives here — that is what gives it '
                    . 'jurisdiction. The complaint must be filed with the barangay where '
                    . 'they reside.',
                422,
                ['respondent_ids' => ['Each respondent must be a barangay resident.']]
            );
        }

        // A resident complainant supersedes any typed-in details.
        if (!empty($validated['complainant_id'])) {
            $validated['complainant_name'] = null;
            $validated['complainant_address'] = null;
            $validated['complainant_contact'] = null;
        } else {
            $validated['complainant_id'] = null;
        }

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
            'complainant_name' => $validated['complainant_name'] ?? null,
            'complainant_address' => $validated['complainant_address'] ?? null,
            'complainant_contact' => $validated['complainant_contact'] ?? null,
            'date_filed' => now()->toDateString(),
            'assigned_lupon_secretary' => auth()->id(),
        ]);

        $case->respondents()->sync($respondentIds);

        $case->complaint()->create([
            'complaint_narrative' => $validated['complaint_narrative'],
            'date_of_occurrence' => $validated['date_of_occurrence'],
            'place_of_occurrence' => $validated['place_of_occurrence'],
            'relationship_nature' => $validated['relationship_nature'],
            'complaint_received_date' => now()->toDateString(),
        ]);

        return $this->success($case->load(['complaint', 'respondents:id,first_name,last_name']), 'Lupon case filed', 201);
    }

    public function show(LuponCase $case)
    {
        $case->load([
            'complaint',
            'assignedLuponSecretary:id,name',
            /*
             * Enough of the register to answer "where do we send the
             * summons?" without asking a resident for an address they have
             * already given. household_id is in the list because the
             * household relation below cannot be loaded without it.
             */
            'complainant:id,resident_number,first_name,middle_name,last_name,suffix,zone_purok,address,contact_number,household_id',
            'complainant.household:id,household_number,street_address',
            'respondents:id,first_name,last_name,zone_purok,contact_number',
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

        /*
         * Jurisdiction rests on the respondent living here — a complainant
         * from another barangay is perfectly entitled to file against one of
         * our residents. Only a missing/non-resident respondent defeats it.
         */
        if ($case->respondents()->count() === 0) {
            $case->update([
                'jurisdiction_status' => 'Rejected',
                'rejection_reason' => 'No barangay-resident respondent on this case — file with the barangay where they reside',
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
            'scheduled_at' => 'required|date|after:' . self::manilaNow(),
            'summons_issued' => 'boolean',
        ]);

        $hearing = $case->hearings()->create($validated + ['recorded_by' => auth()->id()]);

        if ($case->current_stage === 'Filed' && $validated['hearing_type'] === 'Mediation') {
            $case->update(['current_stage' => 'Mediation']);
        }

        foreach ($case->partyResidentIds() as $residentId) {
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
            // Datetime: a proceeding happens at an hour, and it is recorded
            // after it took place, never ahead of it.
            'mediation_date' => 'required|date|before_or_equal:' . self::manilaNow(),
            'attendance' => 'required|in:Both Present,Complainant Only,Respondent Only,Neither',
            'outcome' => 'required|in:Settlement Reached,No Settlement,Rescheduled',
            'proceedings_notes' => 'nullable|string',
        ], [
            'mediation_date.before_or_equal' => 'A mediation cannot be recorded before it has taken place.',
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
        /*
         * The Pangkat ng Tagapagkasundo is a panel of exactly three Lupon
         * members (Local Government Code sec. 404) — chosen by the parties
         * from the Lupon list, or drawn by lot if they cannot agree. Not
         * "at least three": a panel of four has no basis in the law.
         */
        $validated = $request->validate([
            'conciliation_date' => 'required|date|before_or_equal:' . self::manilaNow(),
            'pangkat_members' => 'required|array|size:3',
            'pangkat_members.*' => 'required|string|max:150',
            'outcome' => 'required|in:Settlement,Arbitration,Dismissed',
            'proceedings_notes' => 'nullable|string',
        ], [
            'pangkat_members.size' => 'The Pangkat is composed of exactly three Lupon members.',
            'conciliation_date.before_or_equal' => 'A conciliation cannot be recorded before it has taken place.',
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
            'action' => 'required|in:' . implode(',', self::SETTLEMENT_ACTIONS),
            'notes' => 'nullable|string',
        ]);

        return $this->applySettlementAction($settlement, $validated['action'], $validated['notes'] ?? null);
    }

    /**
     * The compliance/execution state machine, shared by the per-case screen
     * and the desk-wide settlement register.
     */
    private function applySettlementAction(LuponSettlement $settlement, string $action, ?string $notes)
    {
        $case = $settlement->luponCase;

        switch ($action) {
            case 'finalize':
                $settlement->update(['status' => 'Final']);
                break;
            case 'repudiate':
                if (today()->gt($settlement->repudiation_deadline)) {
                    return $this->error('Repudiation period has lapsed — settlement is final', 422);
                }
                $settlement->update(['status' => 'Repudiated']);
                $case?->update(['current_stage' => 'Conciliation']);
                break;
            case 'mark_complied':
                $settlement->update(['status' => 'Complied', 'compliance_notes' => $notes, 'closed_at' => now()]);
                break;
            case 'mark_not_complied':
                $settlement->update(['status' => 'Not Complied', 'compliance_notes' => $notes]);
                break;
            case 'execute':
                $settlement->update(['status' => 'Executed', 'compliance_notes' => $notes]);
                break;
            case 'issue_cfa':
                $settlement->update(['cfa_issued' => true, 'cfa_issued_at' => now()]);
                $case?->update(['current_stage' => 'Referred', 'notes' => 'Certificate to File Action issued']);
                break;
            case 'issue_cba':
                $settlement->update(['cba_issued' => true, 'cba_issued_at' => now()]);
                break;
        }

        return $this->success($settlement->fresh(), 'Settlement updated');
    }

    /*
    |--------------------------------------------------------------------------
    | Desk-wide worklists
    |--------------------------------------------------------------------------
    | The Lupon secretary works a calendar and a compliance register that span
    | every case; the per-case screen stays for the full case narrative.
    */

    /** 3.4 — the hearing calendar across the whole docket. */
    public function deskHearings(Request $request)
    {
        $query = LuponHearing::with(array_merge(self::CASE_WITH_PARTIES, ['recorder:id,name']));

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('hearing_type')) {
            $query->where('hearing_type', $request->hearing_type);
        }

        /*
         * Buckets are whole DAYS, not the current instant. Comparing against
         * now() moved a 9am hearing into "past" by 9:01, so the day's own
         * hearings vanished from the desk while they were still being held.
         */
        if ($request->filled('when')) {
            match ($request->when) {
                'today' => $query->whereDate('scheduled_at', today())->orderBy('scheduled_at'),
                'upcoming' => $query->whereDate('scheduled_at', '>', today())->orderBy('scheduled_at'),
                'past' => $query->whereDate('scheduled_at', '<', today())->orderByDesc('scheduled_at'),
                default => $query->orderByDesc('scheduled_at'),
            };
        } else {
            $query->orderByDesc('scheduled_at');
        }

        // Hearings set but with no summons served yet — the service backlog.
        if ($request->boolean('unserved')) {
            $query->where('status', 'Scheduled')->whereNull('summons_served_date');
        }

        return $this->success($query->paginate(20), 'Hearings retrieved');
    }

    /**
     * 3.4 — summons and proof of service. `summons_served_date` is the
     * proof-of-service record required before a party can be defaulted.
     */
    public function recordSummons(Request $request, LuponHearing $hearing)
    {
        $validated = $request->validate([
            'summons_issued' => 'required|boolean',
            'summons_served_date' => 'nullable|date|before_or_equal:' . self::manilaToday(),
            'attendance_notes' => 'nullable|string',
        ]);

        if (!empty($validated['summons_served_date']) && !$validated['summons_issued']) {
            return $this->error('A summons cannot be served before it is issued.', 422);
        }

        $hearing->update($validated);
        $hearing->load(self::CASE_WITH_PARTIES);

        return $this->success($hearing, 'Summons record updated');
    }

    /** 3.4 — record attendance and the outcome straight from the calendar. */
    public function updateHearing(Request $request, LuponHearing $hearing)
    {
        $validated = $request->validate([
            'status' => 'required|in:Completed,Rescheduled,Cancelled,No Show',
            'complainant_present' => 'nullable|boolean',
            'respondent_present' => 'nullable|boolean',
            'attendance_notes' => 'nullable|string',
            'proceedings_notes' => 'nullable|string',
            'outcome' => 'nullable|string',
        ]);

        $hearing->update($validated + ['recorded_by' => auth()->id()]);
        $hearing->load(self::CASE_WITH_PARTIES);

        return $this->success($hearing, 'Hearing outcome recorded');
    }

    /**
     * 3.4 — resetting a hearing keeps the original in the record (marked
     * Rescheduled) and opens a fresh one, so the trail shows both dates.
     */
    public function rescheduleHearing(Request $request, LuponHearing $hearing)
    {
        $validated = $request->validate([
            'scheduled_at' => 'required|date|after:' . self::manilaNow(),
            'reason' => 'nullable|string',
        ]);

        if (in_array($hearing->status, ['Completed', 'Cancelled'], true)) {
            return $this->error('A ' . strtolower($hearing->status) . ' hearing cannot be rescheduled.', 422);
        }

        $hearing->update([
            'status' => 'Rescheduled',
            'outcome' => $validated['reason'] ?? 'Rescheduled',
            'recorded_by' => auth()->id(),
        ]);

        $case = $hearing->luponCase;

        $replacement = $case->hearings()->create([
            'hearing_type' => $hearing->hearing_type,
            'scheduled_at' => $validated['scheduled_at'],
            'status' => 'Scheduled',
            'summons_issued' => $hearing->summons_issued,
            'recorded_by' => auth()->id(),
        ]);

        foreach ($case->partyResidentIds() as $residentId) {
            Notification::notifyResident(
                $residentId,
                'hearing_scheduled',
                'KP Hearing Reset — ' . $case->case_number,
                sprintf('Your %s hearing has been moved to %s at the Barangay Hall. Attendance is required.',
                    strtolower($hearing->hearing_type),
                    date('F j, Y g:i A', strtotime($validated['scheduled_at']))),
                'lupon_case',
                $case->id
            );
        }

        $replacement->load(self::CASE_WITH_PARTIES);

        return $this->success($replacement, 'Hearing rescheduled — parties notified', 201);
    }

    /** 3.5 — the compliance register across every settled case. */
    public function deskSettlements(Request $request)
    {
        // Lapsed repudiation windows become final before the list is read,
        // so the register never shows a stale "still repudiable" row.
        LuponSettlement::where('status', 'Within Repudiation Period')
            ->whereDate('repudiation_deadline', '<', today())
            ->update(['status' => 'Final']);

        $query = LuponSettlement::with(array_merge(self::CASE_WITH_PARTIES, ['recorder:id,name']));

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('settlement_type')) {
            $query->where('settlement_type', $request->settlement_type);
        }

        // Obligations already past their compliance deadline and not closed.
        if ($request->boolean('due')) {
            $query->whereNotNull('compliance_deadline')
                ->whereDate('compliance_deadline', '<=', today())
                ->whereIn('status', ['Final', 'Not Complied']);
        }

        return $this->success(
            $query->orderByDesc('date_agreed')->orderByDesc('id')->paginate(20),
            'Settlements retrieved'
        );
    }

    /**
     * 3.5 — run a compliance/execution action from the register.
     *
     * `action` is optional: omitting it records the compliance deadline and
     * notes WITHOUT advancing the status, so editing terms can never finalize
     * a settlement that is still inside its repudiation window.
     */
    public function deskSettlementAction(Request $request, LuponSettlement $settlement)
    {
        $validated = $request->validate([
            'action' => 'nullable|in:' . implode(',', self::SETTLEMENT_ACTIONS),
            'notes' => 'nullable|string',
            'compliance_deadline' => 'nullable|date',
        ]);

        if (array_key_exists('compliance_deadline', $validated)) {
            $settlement->update(['compliance_deadline' => $validated['compliance_deadline']]);
        }

        if (empty($validated['action'])) {
            if (array_key_exists('notes', $validated)) {
                $settlement->update(['compliance_notes' => $validated['notes']]);
            }

            return $this->success($settlement->fresh(), 'Compliance terms updated');
        }

        return $this->applySettlementAction($settlement, $validated['action'], $validated['notes'] ?? null);
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
            'upcoming_hearings' => LuponHearing::with(self::CASE_WITH_PARTIES)
                ->where('status', 'Scheduled')
                ->where('scheduled_at', '>=', now())
                ->orderBy('scheduled_at')
                ->limit(10)
                ->get(),
            'repudiation_window' => LuponSettlement::with(self::CASE_WITH_PARTIES)
                ->where('status', 'Within Repudiation Period')
                ->orderBy('repudiation_deadline')
                ->get(),
            'pending_compliance' => LuponSettlement::with(self::CASE_WITH_PARTIES)
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
        $case->load(['complaint', 'complainant', 'respondents', 'settlement', 'hearings']);

        $nextHearing = $case->hearings
            ->where('status', 'Scheduled')
            ->sortBy('scheduled_at')
            ->first();
        $settlement = $case->settlement;

        // `available` tells the UI which prescribed forms this case has the
        // facts to produce — a settlement form needs a settlement on file.
        return $this->success([
            'case' => $case,
            'barangay' => [
                'name' => 'Barangay Natumolan',
                'municipality' => 'Tagoloan',
                'province' => 'Misamis Oriental',
            ],
            'next_hearing' => $nextHearing,
            'forms' => [
                [
                    'code' => 'KP-7',
                    'name' => 'Notice of Hearing (Mediation)',
                    'available' => (bool) $nextHearing,
                    'requires' => 'a scheduled hearing',
                ],
                [
                    'code' => 'KP-9',
                    'name' => 'Summons',
                    'available' => (bool) $nextHearing,
                    'requires' => 'a scheduled hearing',
                ],
                [
                    'code' => 'KP-16',
                    'name' => 'Amicable Settlement',
                    'available' => $settlement?->settlement_type === 'Amicable Settlement',
                    'requires' => 'a recorded amicable settlement',
                ],
                [
                    'code' => 'KP-18',
                    'name' => 'Arbitration Award',
                    'available' => $settlement?->settlement_type === 'Arbitration Award',
                    'requires' => 'a recorded arbitration award',
                ],
                [
                    'code' => 'KP-20',
                    'name' => 'Certificate to File Action',
                    'available' => (bool) $settlement?->cfa_issued,
                    'requires' => 'a Certificate to File Action to have been issued',
                ],
                [
                    'code' => 'KP-21',
                    'name' => 'Certificate to Bar Action',
                    'available' => (bool) $settlement?->cba_issued,
                    'requires' => 'a Certificate to Bar Action to have been issued',
                ],
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

    /** KP-2026-0001 — one above the highest ever issued, never a row count. */
    private function generateCaseNumber(): string
    {
        return SequenceNumber::next('lupon_cases', 'case_number', 'KP-' . date('Y') . '-', 4);
    }
}
