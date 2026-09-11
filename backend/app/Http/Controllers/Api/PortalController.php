<?php

namespace App\Http\Controllers\Api;

use App\Support\SequenceNumber;

use App\Models\Announcement;
use App\Models\Appointment;
use App\Models\ChatConversation;
use App\Models\CertificateClearance;
use App\Support\CertificateCatalogue;
use App\Models\Blotter;
use App\Models\LuponCase;
use App\Models\Resident;
use App\Models\ServiceGuide;
use App\Models\ServiceRequest;
use App\Http\Controllers\Api\CertificateController;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Resident portal — every endpoint is scoped to the authenticated
 * portal account's linked resident record (accounts are created by the BPO).
 */
class PortalController extends BaseController
{
    private function residentId()
    {
        return auth()->user()->resident_id;
    }

    public function dashboard()
    {
        $residentId = $this->residentId();
        $user = auth()->user()->load('resident:id,resident_number,first_name,last_name,zone_purok');

        return $this->success([
            'resident' => $user->resident,
            'stats' => [
                'active_requests' => ServiceRequest::where('resident_id', $residentId)
                    ->whereNotIn('status', ['Completed', 'Rejected', 'Cancelled'])->count(),
                'total_requests' => ServiceRequest::where('resident_id', $residentId)->count(),
                'upcoming_appointments' => Appointment::where('resident_id', $residentId)
                    ->where('status', '!=', 'Cancelled')
                    ->where('scheduled_datetime', '>=', now())->count(),
                'certificates_ready' => CertificateClearance::where('resident_id', $residentId)
                    ->where('status', 'Ready to Claim')->count(),
            ],
            'recent_requests' => ServiceRequest::where('resident_id', $residentId)
                ->latest()->limit(5)->get(),
            'upcoming_appointments' => Appointment::where('resident_id', $residentId)
                ->where('status', '!=', 'Cancelled')
                ->where('scheduled_datetime', '>=', now())
                ->orderBy('scheduled_datetime')->limit(5)->get(),
            /* An expired advisory is dropped by the scope — see Announcement. */
            'announcements' => Announcement::public()->with('creator:id,name')
                ->orderByDesc('published_at')->limit(4)->get(),
        ], 'Portal dashboard retrieved');
    }

    public function myRequests()
    {
        return $this->success(
            /*
             * Table-qualified: certificate() is a latestOfMany relation, which
             * joins the table to itself, and an unqualified column list is
             * ambiguous across that join.
             */
            ServiceRequest::with(['certificate' => fn ($q) => $q->select([
                'certificates_clearances.id',
                'certificates_clearances.service_request_id',
                'certificates_clearances.certificate_number',
                'certificates_clearances.certificate_type',
                'certificates_clearances.status',
                'certificates_clearances.reference_number',
                'certificates_clearances.fee_amount',
                'certificates_clearances.released_at',
            ])])
                ->where('resident_id', $this->residentId())
                ->latest()
                ->paginate(15),
            'Your service requests retrieved'
        );
    }

    public function createRequest(Request $request)
    {
        $validated = $request->validate([
            'service_type' => 'required|string|max:120',
            'purpose' => 'required|string|max:500',
            'office' => 'in:Main Office,Population,Health Station',
            /*
             * Present when the request was raised from the chat widget.
             *
             * The request itself is identical whichever door it came
             * through — same record, same pending certificate, same clerk's
             * worklist — so there is one path and not two. What the token
             * adds is a line in the conversation, so a Secretary who is in
             * the middle of helping somebody sees what they just asked for
             * rather than being told about it later.
             */
            'session_token' => 'nullable|string|size:48',
        ]);

        $serviceRequest = ServiceRequest::create([
            'request_number' => $this->generateRequestNumber(),
            'resident_id' => $this->residentId(),
            'service_type' => $validated['service_type'],
            'office' => $validated['office'] ?? 'Main Office',
            'request_type' => 'Online',
            'status' => 'Pending',
            'purpose' => $validated['purpose'],
        ]);

        /*
         * A request for a certificate raises the certificate itself, Pending,
         * so the resident's ask lands directly on the clerk's worklist in
         * Certificates & Clearances. Nothing waits on an approval behind it:
         * the clerk simply accepts it and starts.
         */
        $certificate = $this->raisePendingCertificate($serviceRequest);

        /*
         * If it came from a live conversation, say so in the conversation.
         * Best-effort: the request is already made, and a chat that cannot
         * be written to is not a reason to fail it.
         */
        if (!empty($validated['session_token'])) {
            $conversation = ChatConversation::where('session_token', $validated['session_token'])
                ->where('resident_id', $this->residentId())
                ->whereIn('status', ['Waiting', 'Active'])
                ->first();

            $conversation?->addMessage(
                'system',
                'Request ' . $serviceRequest->request_number . ' — '
                    . $serviceRequest->service_type . ' — was raised from this chat.'
            );
        }

        // Ping the front desk so the clerk sees (and hears) the new request.
        $residentName = $serviceRequest->resident?->full_name ?? 'A resident';
        \App\Models\Notification::notifyFrontDesk(
            'new_request',
            'New online request: ' . $serviceRequest->service_type,
            $residentName . ' submitted a ' . $serviceRequest->service_type
                . ' request (' . $serviceRequest->request_number . '). Purpose: ' . $serviceRequest->purpose,
            $certificate ? 'certificate' : 'service_request',
            $certificate?->id ?? $serviceRequest->id
        );

        $serviceRequest->load('certificate');

        return $this->success($serviceRequest, 'Request submitted — you will be notified of updates', 201);
    }

    public function showRequest(ServiceRequest $serviceRequest)
    {
        if ($serviceRequest->resident_id !== $this->residentId()) {
            return $this->forbidden('This request does not belong to your account');
        }

        $serviceRequest->load(['certificate', 'appointments', 'assignedUser:id,name']);

        return $this->success($serviceRequest, 'Request retrieved');
    }

    public function myAppointments()
    {
        return $this->success(
            Appointment::where('resident_id', $this->residentId())
                ->orderByDesc('scheduled_datetime')
                ->paginate(15),
            'Your appointments retrieved'
        );
    }

    public function bookAppointment(Request $request)
    {
        $validated = $request->validate([
            'office' => 'required|in:Main Office,Population,Health Station,Lupon',
            'scheduled_datetime' => 'required|date',
            'notes' => 'nullable|string|max:500',
            'service_request_id' => 'nullable|exists:service_requests,id',
        ]);

        // The time is a Manila wall-clock value — validate "future" in that
        // zone so a time earlier today isn't wrongly accepted (UTC is +8h off).
        if (\Illuminate\Support\Carbon::parse($validated['scheduled_datetime'], 'Asia/Manila')->isPast()) {
            return $this->error('Please choose a date and time in the future.', 422);
        }

        if (!empty($validated['service_request_id'])) {
            $owned = ServiceRequest::where('id', $validated['service_request_id'])
                ->where('resident_id', $this->residentId())->exists();
            if (!$owned) {
                return $this->forbidden('That service request is not yours');
            }
        }

        $appointment = Appointment::create($validated + [
            'appointment_number' => SequenceNumber::next(
                'appointments',
                'appointment_number',
                'APT-' . date('Y') . '-',
                5
            ),
            'resident_id' => $this->residentId(),
            'status' => 'Pending',
        ]);

        return $this->success($appointment, 'Appointment requested — await confirmation', 201);
    }

    public function cancelAppointment(Appointment $appointment)
    {
        if ($appointment->resident_id !== $this->residentId()) {
            return $this->forbidden('This appointment does not belong to your account');
        }

        $appointment->update([
            'status' => 'Cancelled',
            'cancelled_at' => now(),
            'cancellation_reason' => 'Cancelled by resident via portal',
        ]);

        return $this->success($appointment, 'Appointment cancelled');
    }

    /**
     * What the resident is choosing between, with the fee and the papers.
     *
     * The request form used to be a bare dropdown of names. A resident
     * picked one, walked to the office, and found out at the counter that
     * they needed a valid ID and ₱50 — which is a wasted trip for somebody
     * who may have walked half an hour to make it.
     *
     * The fee comes from the certificate module's own schedule, because
     * that is the number the clerk will actually charge; the requirements
     * come from the service guide, which is what the Secretary maintains.
     */
    public function certificateServices()
    {
        $guides = ServiceGuide::where('is_active', true)
            ->where('office', 'Main Office')
            ->get()
            ->keyBy('service_name');

        $services = [];

        foreach (CertificateCatalogue::TYPES as $type => $spec) {
            /*
             * The two lists are maintained separately and do not always
             * agree word for word: the fee schedule says "First-Time
             * Jobseeker" and the guide says "First-Time Jobseeker
             * Certification". An exact match alone dropped that one's
             * requirements silently, which is the worst way to lose them —
             * the form looked complete and told the resident nothing.
             */
            $guide = $guides->get($type)
                ?? $guides->first(fn ($g) => str_starts_with($g->service_name, $type)
                    || str_starts_with($type, $g->service_name));

            $services[] = [
                'certificate_type' => $type,
                /*
                 * Null where the ordinance prices by purpose rather than by
                 * document — a clearance is ₱20 to ₱200 depending what it is
                 * for, and printing one of those numbers as THE fee would
                 * quote most residents the wrong amount. The portal says the
                 * fee is set at the counter instead.
                 */
                'fee' => $spec['fee'] !== null ? (float) $spec['fee'] : null,
                'fee_varies' => $spec['fee'] === null,
                'description' => $guide?->description,
                // Split into lines so the form can list them rather than
                // printing one long comma-separated string.
                'requirements' => $guide && trim((string) $guide->requirements) !== ''
                    ? array_values(array_filter(array_map(
                        'trim',
                        preg_split('/[,;\n]+/', $guide->requirements)
                    )))
                    : [],
                'schedule' => $guide?->schedule,
            ];
        }

        return $this->success($services, 'Certificate services retrieved');
    }

    public function myCertificates()
    {
        return $this->success(
            CertificateClearance::where('resident_id', $this->residentId())
                ->latest()
                ->paginate(15),
            'Your certificates retrieved'
        );
    }

    public function profile()
    {
        $user = auth()->user()->load(['resident.household']);

        return $this->success(
            /*
             * The list travels with the profile rather than from a second
             * call: the page cannot render the one editable field without
             * it, and two requests for one screen is two chances for it to
             * arrive half-drawn.
             */
            ['user' => $user, 'occupations' => Resident::OCCUPATIONS],
            'Profile retrieved'
        );
    }

    /**
     * The resident says what work they do.
     *
     * The only field in the registry a resident may change about themselves.
     * From a fixed list, because the barangay counts these: "Carpenter",
     * "carpenter" and "Karpentero" typed into an open box are three
     * occupations to a report and one job to everybody else.
     */
    public function updateOccupation(Request $request)
    {
        $resident = auth()->user()?->resident;

        if (! $resident) {
            return $this->error('This account is not linked to a resident record.', 404);
        }

        $validated = $request->validate([
            'occupation' => ['required', 'string', Rule::in(Resident::OCCUPATIONS)],
        ], [
            'occupation.in' => 'Choose one of the listed occupations.',
        ]);

        $resident->forceFill(['occupation' => $validated['occupation']])->save();

        return $this->success(
            ['occupation' => $resident->occupation],
            'Your occupation has been updated.'
        );
    }

    /**
     * The resident's family as recorded in the registry: their parents, their
     * parents' parents (lola/lolo), their spouse, their children and their
     * siblings. Read-only, because the Population Office owns the registry:
     * the portal only lets a resident see who they are connected to.
     */
    public function family()
    {
        $resident = Resident::with([
            // `parents.parents.children.children` is what produces the aunts,
            // uncles and cousins below without storing any of them.
            'parents.parents.children.children',
            'parents.children',
            'children',
            'spouse',
            // Who is raising them, and whom they are raising. A guardian is
            // not on the family tree — they are the person at the door.
            'guardians',
            'wards',
        ])->find($this->residentId());

        if (!$resident) {
            return $this->notFound('No resident record is linked to your account');
        }

        /*
         * Each group gets the word that is true FROM THE RESIDENT'S SIDE. A
         * parent/child link stores one word for each end, and everyone else
         * is named from their sex — otherwise a resident's own father shows
         * up on their profile labelled "Son", which is what used to happen.
         */
        $card = fn ($person, string $kind) => $person === null ? null : [
            'id' => $person->id,
            'full_name' => $person->full_name,
            'gender' => $person->gender,
            'birthdate' => $person->birthdate?->toDateString(),
            'age' => $person->birthdate?->age,
            'zone_purok' => $person->zone_purok,
            'relationship' => match ($kind) {
                'parent' => $person->pivot?->parent_role,
                'child' => $person->pivot?->child_role,
                'guardian', 'ward' => $person->pivot?->relation,
                default => null,
            } ?: Resident::roleLabel($person->gender, $kind),
        ];

        $cards = fn ($people, string $kind) => collect($people)
            ->map(fn ($person) => $card($person, $kind))->values();

        return $this->success([
            'self' => $card($resident, 'self'),
            /*
             * A step-parent is kept in their own group. Listing them under
             * "Parents" reads as a claim about who bore this resident, which
             * is not what a remarriage says.
             */
            'parents' => $cards($resident->bloodParents(), 'parent'),
            'grandparents' => $cards($resident->grandparents(), 'grandparent'),
            // Labelled for the kind of union: a live-in partner is not a
            // "Husband" or a "Wife".
            'spouse' => (function () use ($resident, $card) {
                $built = $card($resident->spouse, 'spouse');

                if ($built && $resident->currentMarriage()?->isLiveIn()) {
                    $built['relationship'] = 'Partner (live-in)';
                }

                return $built;
            })(),
            'children' => $cards($resident->bloodChildren(), 'child'),
            // Half-brothers and half-sisters named as such where it is known.
            'siblings' => collect($resident->siblings())
                ->map(fn ($sibling) => $card($sibling, $resident->siblingKind($sibling)))
                ->values(),
            'aunts_uncles' => $cards($resident->auntsAndUncles(), 'aunt_uncle'),
            'cousins' => $cards($resident->cousins(), 'cousin'),
            /*
             * Care, not descent. Shown to the resident because they are often
             * the one who has to say who their guardian is at a counter, and
             * because a young resident living with a lola should be able to
             * see that the barangay has it right.
             */
            'guardians' => $cards($resident->guardians, 'guardian'),
            'wards' => $cards($resident->wards, 'ward'),
            // Only present when the family agreed the children may see it.
            'parents_note' => $this->parentsMarriageNote($resident),
        ], 'Family retrieved');
    }

    /**
     * The resident's own cases — what they filed, and what was filed on them.
     *
     * WHAT IS NOT HERE MATTERS MORE THAN WHAT IS.
     *
     * There is no VAWC. Not the case, not its status, not the fact that one
     * exists. The person a survivor is escaping usually lives in the same
     * house and often uses the same phone, and a line reading "VAWC case —
     * Active" on a portal anybody in that house can open is how somebody gets
     * hurt. RA 9262 makes those records confidential; this endpoint keeps
     * them that way by never asking for them. Follow-up happens at the desk,
     * in person, which is the only place it is safe.
     *
     * KP cases and blotters are different: summons are served at the door and
     * the process is adversarial and open by design. But a KP case has TWO
     * sides, so each side sees their own view — a respondent is told when to
     * appear, never where the complainant lives.
     */
    public function cases()
    {
        $residentId = $this->residentId();

        if (!$residentId) {
            return $this->notFound('No resident record is linked to your account');
        }

        $kp = LuponCase::where('complainant_id', $residentId)
            ->orWhereHas('respondents', fn ($q) => $q->where('residents.id', $residentId))
            ->with([
                'complaint:id,lupon_case_id,date_of_occurrence,place_of_occurrence',
                'hearings' => fn ($q) => $q->orderBy('scheduled_at'),
                'settlement',
            ])
            ->orderByDesc('date_filed')
            ->get()
            ->map(function ($case) use ($residentId) {
                $mine = $case->complainant_id === $residentId ? 'Complainant' : 'Respondent';

                // The next thing they have to turn up for.
                $next = $case->hearings
                    ->firstWhere(fn ($h) => $h->status === 'Scheduled' && $h->scheduled_at?->isFuture());

                return [
                    'case_number' => $case->case_number,
                    'title' => $case->case_title,
                    'classification' => $case->case_classification,
                    'my_role' => $mine,
                    'stage' => $case->current_stage,
                    'date_filed' => $case->date_filed?->toDateString(),
                    'date_resolved' => $case->date_resolved?->toDateString(),
                    'occurred_on' => $case->complaint?->date_of_occurrence?->toDateString(),
                    'place' => $case->complaint?->place_of_occurrence,
                    /*
                     * The other side is named — they must be, a person is
                     * entitled to know who they are in a dispute with — but
                     * never their address or number. That is the difference
                     * between telling somebody who complained and telling
                     * them where to find them.
                     */
                    'other_party' => $mine === 'Complainant'
                        ? $case->respondents->map(fn ($r) => $r->full_name)->join(', ')
                        : ($case->complainant?->full_name ?: $case->complainant_name),
                    'next_hearing' => $next ? [
                        'type' => $next->hearing_type,
                        'scheduled_at' => $next->scheduled_at?->toDateTimeString(),
                        'summons_served' => $next->summons_served_date?->toDateString(),
                    ] : null,
                    'hearings_held' => $case->hearings->where('status', 'Completed')->count(),
                    'settlement' => $case->settlement ? [
                        'type' => $case->settlement->settlement_type,
                        'agreed_on' => $case->settlement->date_agreed?->toDateString(),
                        'status' => $case->settlement->status,
                        // The two documents that decide what happens next.
                        'certificate_to_file_action' => (bool) $case->settlement->cfa_issued,
                    ] : null,
                ];
            })
            ->values();

        $blotters = Blotter::where('reporter_id', $residentId)
            ->orWhereHas('people', fn ($q) => $q->where('resident_id', $residentId))
            ->orderByDesc('recorded_at')
            ->get()
            ->map(fn ($entry) => [
                'blotter_number' => $entry->blotter_number,
                'recorded_at' => $entry->recorded_at?->toDateTimeString(),
                'incident_at' => $entry->incident_at?->toDateTimeString(),
                'incident_type' => $entry->incident_type,
                'place' => $entry->place_of_incident,
                'my_role' => $entry->reporter_id === $residentId
                    ? 'Reported it'
                    : 'Named in the entry',
                'action_taken' => $entry->action_taken,
                'status' => $entry->status,
                // Deliberately no narrative: what one person told the desk
                // about another is not for the other to read from home.
            ])
            ->values();

        return $this->success([
            'kp_cases' => $kp,
            'blotters' => $blotters,
        ], 'Your cases retrieved');
    }

    /**     * How the resident's parents' marriage ended, shown only where the family
     * agreed the children may see it. Recorded on the parents' records either
     * way — the consent governs who it is shown to, not whether it is kept.
     */
    private function parentsMarriageNote(Resident $resident): ?array
    {
        $parentIds = $resident->parents->pluck('id');

        if ($parentIds->count() < 2) {
            return null;
        }

        $marriage = \App\Models\ResidentMarriage::whereNotNull('ended_on')
            ->where('shown_to_children', true)
            ->whereIn('resident_id', $parentIds)
            ->whereIn('spouse_id', $parentIds)
            ->with('deceased:id,first_name,middle_name,last_name,suffix')
            ->orderByDesc('ended_on')
            ->first();

        return $marriage ? [
            'end_reason' => $marriage->end_reason,
            'ended_on' => $marriage->ended_on?->toDateString(),
            'deceased_name' => $marriage->deceased?->full_name,
        ] : null;
    }

    /**
     * Creates the Pending certificate behind an online request, when the
     * service asked for is one that produces a document. Returns null for
     * everything else (blotter, complaints, health services...).
     */
    private function raisePendingCertificate(ServiceRequest $serviceRequest): ?CertificateClearance
    {
        $type = ServiceRequestController::CERTIFICATE_TYPES[$serviceRequest->service_type] ?? null;

        if (!$type) {
            return null;
        }

        return CertificateClearance::create([
            'certificate_number' => CertificateClearance::nextCertificateNumber(),
            'reference_number' => CertificateClearance::nextReferenceNumber(),
            'resident_id' => $serviceRequest->resident_id,
            'service_request_id' => $serviceRequest->id,
            'certificate_type' => $type,
            'purpose' => $serviceRequest->purpose ?: $type,
            /*
             * Provisional. A resident asking online writes the purpose in
             * their own words, which will not match the ordinance's list, so
             * this lands on the catch-all until the clerk picks the real
             * purpose at the counter — which reprices it.
             */
            'fee_amount' => CertificateCatalogue::feeFor($type, $serviceRequest->purpose) ?? 0,
            'is_exempt' => false,
            'status' => 'Pending',
        ]);
    }

    /** The same series the counter issues from — see ServiceRequestController. */
    private function generateRequestNumber(): string
    {
        return SequenceNumber::next('service_requests', 'request_number', 'REQ-' . date('Y') . '-', 6);
    }
}
