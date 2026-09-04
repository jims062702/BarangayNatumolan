<?php

namespace App\Http\Controllers\Api;

use App\Support\LandingCache;
use App\Models\Household;
use App\Models\RbimCensus;
use App\Models\RbimCensusMember;
use App\Models\Resident;
use App\Models\ResidentMarriage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The RBIM baseline census — collected on paper, encoded here.
 *
 * The BHW visits each household and fills the sheet in by hand. The sheet is
 * carried to the Population Office, and the Population Office types it in.
 * Nobody but the Population Office touches this module: there is no hand-over
 * inside the system, because the hand-over already happened on paper.
 *
 * So there are two states, not three:
 *
 *   Draft      being typed. Nobody is on the register yet.
 *   Submitted  the household has been registered. Still editable — a
 *              household gains a baby, loses a head, corrects a spelling, and
 *              refusing that just moves the correction off the system.
 *
 * Submitting is what puts people on the register. Everything a census line
 * says becomes a resident record, the line is joined to it, and re-submitting
 * after an edit adds only whoever is new. It is the one door between the two,
 * and it is deliberate: a form is typed, checked, and then registered.
 */
class RbimCensusController extends BaseController
{
    /** Who may collect and encode: the BHW and the Population Office. */
    private function canCollect(): bool
    {
        $office = auth()->user()?->office;

        return in_array($office, ['Population', 'Health Station', 'Admin'], true);
    }

    /** Only the Population Office reconciles a census into the register. */
    private function canReconcile(): bool
    {
        return in_array(auth()->user()?->office, ['Population', 'Admin'], true);
    }

    public function index(Request $request): JsonResponse
    {
        $query = RbimCensus::with([
            'household:id,household_number,zone_purok',
            'recorder:id,name',
        ])->withCount('members');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('search')) {
            $term = trim($request->input('search'));
            $query->where(function ($q) use ($term) {
                /*
                 * The address is searched in the parts it was collected in.
                 * An office looking for one house types the block or the
                 * unit, not the street it shares with forty others.
                 */
                $q->where('census_no', 'like', "%{$term}%")
                    ->orWhere('household_head_name', 'like', "%{$term}%")
                    ->orWhere('respondent_name', 'like', "%{$term}%")
                    ->orWhere('address_street', 'like', "%{$term}%")
                    ->orWhere('address_house_lot', 'like', "%{$term}%")
                    ->orWhere('address_unit', 'like', "%{$term}%");
            });
        }

        return $this->success(
            $query->latest('id')->paginate(20)->toArray() + [
                'counts' => [
                    'Draft' => RbimCensus::where('status', 'Draft')->count(),
                    'Submitted' => RbimCensus::where('status', 'Submitted')->count(),
                ],
            ],
            'RBIM census forms retrieved'
        );
    }

    /**
     * Is this household number already on the register, and who is in it?
     *
     * The paper form holds ten lines. A household with fifteen people needs
     * two sheets, and the second one is NOT a second household — it is the
     * same house, continued. Without this check the office types the number
     * again, gets a new record, and one family ends up on the books twice
     * with nothing linking the halves.
     *
     * It answers, and does nothing else. Whether to join the existing house
     * or to correct a mistyped number is the clerk's call — and sometimes
     * neither, because the respondent gave the wrong number and somebody has
     * to go back and ask.
     */
    /**
     * Is this email address free to be a login?
     *
     * `residents.email` is unique because a portal account is issued against
     * an address and against nothing else. Two people cannot share one, and
     * the place to find that out is the doorstep — while the BHW is still
     * standing there and can ask for another one — not three weeks later
     * when a line is being matched and the address is silently dropped.
     *
     * The phone number is not checked. A household shares a phone all the
     * time, nothing is issued against it, and warning about it would teach
     * the office to click past warnings.
     */
    public function checkEmail(Request $request): JsonResponse
    {
        $email = trim((string) $request->input('email'));

        if ($email === '') {
            return $this->error('Type an email address to check.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->success([
                'email' => $email,
                'available' => false,
                'reason' => 'malformed',
            ], 'That does not look like an email address.');
        }

        /*
         * The register first — this is the one that actually blocks a login.
         *
         * A hit is not automatically a mistake. The commonest case by far is
         * that this IS the person: a head already on the register, being
         * written onto a census form. So the answer names who holds it and
         * lets the office decide, rather than calling it an error.
         */
        $resident = Resident::where('email', $email)
            ->whereNull('merged_into_id')
            ->first(['id', 'resident_number', 'first_name', 'middle_name', 'last_name']);

        if ($resident) {
            /*
             * Their own address is not a clash.
             *
             * A line already matched to this resident, carrying the address
             * the register holds for them, is the system working. Calling
             * that a duplicate would put a red warning on every correctly
             * matched line in the form and teach the office to ignore it.
             */
            if ((int) $request->input('resident_id') === $resident->id) {
                return $this->success([
                    'email' => $email,
                    'available' => true,
                    'reason' => 'own',
                ], 'This is their own address, already on the register.');
            }

            return $this->success([
                'email' => $email,
                'available' => false,
                'reason' => 'resident',
                'resident' => [
                    'id' => $resident->id,
                    'resident_number' => $resident->resident_number,
                    'name' => $resident->full_name,
                ],
            ], 'Already on the register under ' . $resident->full_name
                . ' (' . $resident->resident_number . '). If that is this same person, '
                . 'match the line to them. If not, this household member needs their own address.');
        }

        /*
         * Then the other census forms. This blocks nothing yet — neither
         * line has reached the register — but two forms holding one address
         * means one of them is wrong, and it is cheaper to find out now.
         *
         * The form being typed is excluded: its own lines are checked on
         * screen, where the answer needs no round trip.
         */
        $onCensus = RbimCensusMember::query()
            ->where('email', $email)
            ->when($request->filled('census_id'),
                fn ($q) => $q->where('rbim_census_id', '!=', (int) $request->input('census_id')))
            ->with('census:id,census_no')
            ->first();

        if ($onCensus) {
            return $this->success([
                'email' => $email,
                'available' => false,
                'reason' => 'census',
                'census' => [
                    'id' => $onCensus->census->id ?? null,
                    'census_no' => $onCensus->census->census_no ?? null,
                    'name' => $onCensus->full_name,
                ],
            ], 'Another census form (' . ($onCensus->census->census_no ?? 'no number')
                . ') already collected this address for ' . $onCensus->full_name
                . '. Only one of the two can keep it.');
        }

        return $this->success([
            'email' => $email,
            'available' => true,
        ], 'Free to use — a portal account can be issued to it.');
    }

    public function verifyHousehold(Request $request): JsonResponse
    {
        $number = trim((string) $request->input('household_number'));

        if ($number === '') {
            return $this->error('Type a household number to check.', 422);
        }

        /*
         * The form first.
         *
         * One number, one household, one census form — so if a form already
         * carries this number, that IS the record for this house and the
         * office should be standing in it, adding the people the second
         * sheet lists. Starting a new form would split one family across
         * two records that nothing joins.
         */
        /*
         * Except the form being edited.
         *
         * Verifying the number that is already on this form used to report
         * the form itself as a clash, and offer a "Continue editing" link
         * pointing at the page the office was already looking at. Clicking it
         * did nothing, which read as the form refusing to be edited.
         */
        $census = RbimCensus::where('census_no', $number)
            ->when($request->filled('census_id'),
                fn ($q) => $q->where('id', '!=', (int) $request->input('census_id')))
            ->withCount('members')
            ->first();

        $household = Household::where('household_number', $number)
            ->with(['head:id,resident_number,first_name,last_name'])
            ->first();

        if (!$census && !$household) {
            return $this->success([
                'exists' => false,
                'household_number' => $number,
            ], 'Nothing carries that number yet — this will be a new one.');
        }

        if ($census) {
            return $this->success([
                'exists' => true,
                'census' => $census->only([
                    'id', 'census_no', 'status', 'household_head_name', 'members_count',
                ]),
                'household' => $household?->only([
                    'id', 'household_number', 'zone_purok', 'street_address',
                ]),
                'residents' => $household
                    ? Resident::where('household_id', $household->id)
                        ->whereNull('merged_into_id')
                        ->orderBy('last_name')
                        // Sex and birthdate travel too: the form starts from who the
                        // register already says lives here, and Q3 and Q4 are
                        // answers it already holds.
                        ->get(['id', 'resident_number', 'first_name', 'middle_name',
                               'last_name', 'gender', 'birthdate'])
                    : [],
                'resident_count' => $household
                    ? Resident::where('household_id', $household->id)->whereNull('merged_into_id')->count()
                    : 0,
            ], 'Census ' . $census->census_no . ' already covers this household — '
                . $census->members_count . ' line(s) are on it. Open it and add the rest there.');
        }

        /*
         * Who is already there, and which census forms already cover it.
         * Both matter: the first says how many lines the next sheet is
         * continuing from, the second says whether somebody has already
         * typed this visit in.
         */
        $residents = Resident::where('household_id', $household->id)
            ->whereNull('merged_into_id')
            ->orderBy('last_name')
            ->get(['id', 'resident_number', 'first_name', 'middle_name', 'last_name',
                    'record_type', 'gender', 'birthdate']);

        $censuses = RbimCensus::where('household_id', $household->id)
            ->withCount('members')
            ->orderByDesc('id')
            ->get(['id', 'census_no', 'status', 'household_head_name', 'created_at']);

        return $this->success([
            'exists' => true,
            'household' => $household->only([
                'id', 'household_number', 'zone_purok', 'street_address',
            ]) + ['head' => $household->head?->only([
                'id', 'resident_number', 'first_name', 'last_name',
            ])],
            'residents' => $residents,
            'resident_count' => $residents->count(),
            'censuses' => $censuses,
        ], $residents->count() . ' person(s) are already recorded in household '
            . $number . '.');
    }

    /** Every code list on the form, so the frontend renders one source. */
    public function codeLists(): JsonResponse
    {
        return $this->success([
            'member' => RbimCensusMember::codeLists(),
            'household' => RbimCensus::codeLists(),
        ], 'RBIM code lists retrieved');
    }

    public function show(RbimCensus $rbimCensus): JsonResponse
    {
        $rbimCensus->load([
            'members.resident:id,resident_number,first_name,last_name',
            'household:id,household_number,zone_purok,street_address',
            'recorder:id,name',
            'reviewer:id,name',
        ]);

        return $this->success($rbimCensus, 'RBIM census retrieved');
    }

    public function store(Request $request): JsonResponse
    {
        if (!$this->canCollect()) {
            return $this->forbidden('Your office does not collect the RBIM census');
        }

        $validated = $request->validate($this->rules(), [
            'census_no.unique' => 'That form number is already on another census. '
                . 'Check the number printed on the paper sheet.',
        ]);

        $census = DB::transaction(function () use ($validated, $request) {
            $members = $validated['members'] ?? [];
            unset($validated['members']);

            $census = RbimCensus::create($validated + [
                // ?? not ?: — a nullable rule leaves the key ABSENT when
                // nothing was sent, and reading it directly is a 500 at the
                // doorstep.
                'census_no' => ($validated['census_no'] ?? null) ?: RbimCensus::nextNumber(),
                'recorded_by' => auth()->id(),
                'status' => 'Draft',
            ]);

            $this->writeMembers($census, $members);

            return $census;
        });

        return $this->success(
            $census->load('members'),
            'RBIM census ' . $census->census_no . ' saved as a draft.',
            201
        );
    }

    public function update(Request $request, RbimCensus $rbimCensus): JsonResponse
    {
        if (!$this->canCollect()) {
            return $this->forbidden('Your office does not collect the RBIM census');
        }

        /*
         * A submitted census stays editable.
         *
         * A household is not finished when the form is: a baby arrives, the
         * head dies, a name was spelt wrong at the door. Closing the form
         * would not stop any of that happening — it would only stop the
         * system hearing about it.
         */
        $validated = $request->validate($this->rules($rbimCensus->id), [
            'census_no.unique' => 'That form number is already on another census. '
                . 'Check the number printed on the paper sheet.',
        ]);

        DB::transaction(function () use ($validated, $rbimCensus) {
            $members = $validated['members'] ?? null;
            unset($validated['members']);

            $rbimCensus->update($validated);

            // Sent at all means sent whole: the grid is one answer, and a
            // partial write would leave lines from two different visits.
            if ($members !== null) {
                /*
                 * Who each line was, before the grid is rewritten.
                 *
                 * The rewrite deletes every line and writes them again, which
                 * silently threw away the resident each one had been joined
                 * to. A form edited after submitting then had every line
                 * pointing at nobody, and submitting again registered the
                 * whole household a SECOND time — four people became seven.
                 *
                 * Matched back by name, the same comparison the rest of this
                 * module uses to decide that a line and a record are one
                 * person. A line whose name was corrected loses its link and
                 * is re-matched by hand, which is right: the office has just
                 * changed who that line says it is.
                 */
                $wasMatched = $rbimCensus->members()
                    ->whereNotNull('resident_id')
                    ->get()
                    ->mapWithKeys(fn ($m) => [
                        $this->nameKey($m->first_name, $m->last_name) => $m->resident_id,
                    ]);

                $rbimCensus->members()->delete();
                $this->writeMembers($rbimCensus, $members);

                if ($wasMatched->isNotEmpty()) {
                    foreach ($rbimCensus->members()->get() as $line) {
                        $key = $this->nameKey($line->first_name, $line->last_name);

                        if ($wasMatched->has($key)) {
                            $line->update(['resident_id' => $wasMatched[$key]]);
                        }
                    }
                }
            }
        });

        return $this->success($rbimCensus->fresh()->load('members'), 'RBIM census updated');
    }

    /**
     * Registers the household — the one door from a census to the register.
     *
     * Every line with a name becomes a resident record, and the line is
     * joined to it so the two can never drift into being two people. Lines
     * already joined are left alone, which is what makes this safe to press
     * again after an edit: a household that gains a baby is submitted again
     * and only the baby is new.
     *
     * Nothing is written unless EVERY line can be. A household half on the
     * register is worse than one not on it at all — nobody can tell by
     * looking which half, and the second attempt would duplicate the first.
     * So the whole sheet is checked first and refused as a whole, naming the
     * line and the box, and it all happens in one transaction.
     */
    public function submit(RbimCensus $rbimCensus): JsonResponse
    {
        if (!$this->canCollect()) {
            return $this->forbidden('Your office does not collect the RBIM census');
        }

        $members = $rbimCensus->members()->orderBy('id')->get();

        if ($members->isEmpty()) {
            return $this->error('Add at least one household member before submitting.', 422);
        }

        /*
         * Consent is not paperwork. The form carries a signature block and
         * says the answers may not be used without it — so a census with no
         * consent recorded does not become a household on the register.
         */
        if (!$rbimCensus->consent_given) {
            return $this->error(
                'The respondent\'s consent has not been recorded. The household cannot be '
                    . 'registered without it.',
                422
            );
        }

        if (!$rbimCensus->zone_purok) {
            return $this->error(
                'Set the purok on the form. Every resident record carries one, and the '
                    . 'paper sheet has nowhere to record it.',
                422
            );
        }

        // Only lines somebody has actually filled in. A blank card is not a
        // person, and a form of ten always has some.
        $named = $members->filter(fn ($m) => trim((string) $m->first_name) !== ''
            || trim((string) $m->last_name) !== '');

        /*
         * And only the lines marked for it.
         *
         * Line 1 is the household head and is always registered — there is no
         * household without one, which is why that line has no switch. The
         * rest default to on and can be turned off: a census records who was
         * in the house that evening, and a visiting cousin from the next
         * barangay belongs on the sheet without belonging on this register.
         */
        $first = $named->first();

        $toRegister = $named->filter(
            fn ($m) => $m->id === $first?->id || $m->register_as_resident
        );

        if ($named->isEmpty()) {
            return $this->error('No line on this form has a name on it.', 422);
        }

        $problems = [];

        foreach ($named as $member) {
            $line = $members->search(fn ($m) => $m->id === $member->id) + 1;

            if ($member->resident_id) {
                continue; // already on the register; nothing to check
            }

            $missing = [];

            if (trim((string) $member->first_name) === '') { $missing[] = 'a first name (Q1)'; }
            if (trim((string) $member->last_name) === '') { $missing[] = 'a surname (Q1)'; }
            if (!in_array((int) $member->q3_sex, [1, 2], true)) { $missing[] = 'sex (Q3)'; }

            if (!$this->birthdateOf($member)) {
                $missing[] = 'a birth month and year (Q5)';
            }

            if ($missing !== []) {
                $problems[] = 'Line ' . $line . ' (' . trim($member->first_name . ' ' . $member->last_name)
                    . ') needs ' . implode(', ', $missing) . '.';
            }
        }

        if ($problems !== []) {
            return $this->error(
                'The register needs a little more than the paper form asks. '
                    . implode(' ', $problems),
                422,
                ['members' => $problems]
            );
        }

        $registered = [];
        $already = 0;
        $family = [];

        DB::transaction(function () use ($rbimCensus, $named, $toRegister, &$first, &$registered, &$already, &$family) {
            /*
             * The household first, so every person created below can be put
             * in it. The census number IS the household number — one number,
             * one house — so an existing household is reused rather than
             * doubled.
             */
            $household = $rbimCensus->household_id
                ? Household::find($rbimCensus->household_id)
                : Household::firstOrCreate(
                    ['household_number' => $rbimCensus->census_no],
                    [
                        'zone_purok' => $rbimCensus->zone_purok,
                        'street_address' => trim(implode(', ', array_filter([
                            $rbimCensus->address_unit,
                            $rbimCensus->address_house_lot,
                            $rbimCensus->address_street,
                        ]))) ?: null,
                    ]
                );

            foreach ($toRegister as $member) {
                if ($member->resident_id) {
                    $already++;
                    continue;
                }

                $resident = $this->registerLine($member, $rbimCensus, $household);
                $member->update(['resident_id' => $resident->id]);
                $registered[] = $resident->full_name;
            }

            /*
             * Line 1 is the head — that is what Q2 code 01 means — so the
             * household is headed by whoever line 1 turned out to be.
             */
            $first = $first?->fresh();

            if ($household && $first?->resident_id && !$household->household_head_id) {
                $household->update(['household_head_id' => $first->resident_id]);
            }

            /*
             * Q2 said who these people are to each other. Now that they all
             * exist, that column of codes becomes a family — read fresh,
             * because the lines were only just given their resident ids.
             */
            $family = $this->buildFamilyFrom(
                $rbimCensus->members()->orderBy('id')->get()->filter(
                    fn ($m) => trim((string) $m->first_name) !== ''
                        || trim((string) $m->last_name) !== ''
                )
            );

            $rbimCensus->update([
                'household_id' => $household?->id,
                'status' => 'Submitted',
                'submitted_at' => now(),
            ]);
        });

        LandingCache::clearStats();

        $count = count($registered);

        return $this->success(
            $rbimCensus->fresh()->load('members.resident'),
            $count === 0
                ? 'Submitted. Everybody on this form was already on the register.'
                : $count . ' ' . ($count === 1 ? 'person is' : 'people are')
                    . ' now on the barangay register: ' . implode(', ', $registered) . '.'
                    . ($already > 0 ? ' ' . $already . ' were already there.' : '')
                    // What Q2 turned into family, so the office sees it happened.
                    . ($family !== [] ? ' ' . implode(' ', $family) : '')
        );
    }

    /**
     * The date of birth the register will hold, from Q5 alone.
     *
     * The census asks for a month and a year. It does not ask for a day and
     * should not: the BHW is copying a sheet that has no box for one, so any
     * day recorded here would be invented.
     *
     * The last day of the month, then — which makes age turn over at the end
     * of the birth month. Somebody born in June is 32 for all of June and 33
     * from July. That is the safe direction to be wrong in: it never makes
     * anybody older than they are, so nobody is handed a senior citizen's
     * entitlement or a youth programme's cut-off a month early.
     *
     * Whoever ends up holding this record is told it is approximate — see
     * `birthdate_is_estimated`.
     */
    private function birthdateOf(RbimCensusMember $member): ?string
    {
        $year = (int) $member->q5_birth_year;
        $month = (int) $member->q5_birth_month;

        if ($year < 1900 || $month < 1 || $month > 12) {
            return null;
        }

        // cal_days_in_month is not always compiled in; this is the same sum.
        $lastDay = (int) date('t', mktime(0, 0, 0, $month, 1, $year));

        return sprintf('%04d-%02d-%02d', $year, $month, $lastDay);
    }

    /**
     * Turns one census line into a resident record.
     *
     * Only what the census actually answers is carried. Q11's education codes
     * and the register's list are different vocabularies, and Q36's type of
     * resident is worked out from Q33–Q35 rather than asked — so neither is
     * guessed at here. A blank field is honest; a wrong one is not.
     */
    private function registerLine(
        RbimCensusMember $member,
        RbimCensus $census,
        ?Household $household
    ): Resident {
        // Only the four the register offers. Living-in, Divorced and Unknown
        // have no equivalent there, and a wrong civil status is worse than none.
        $marital = RbimCensusMember::MARITAL_STATUSES[(int) $member->q8_marital_status] ?? null;
        $civil = in_array($marital, ['Single', 'Married', 'Widowed', 'Separated'], true)
            ? $marital
            : null;

        $resident = Resident::create([
            // The register's own rule, not a second copy of it.
            'resident_number' => Resident::nextNumber(),
            'first_name' => trim($member->first_name),
            'middle_name' => trim((string) $member->middle_name) ?: null,
            'last_name' => trim($member->last_name),
            'gender' => RbimCensusMember::SEXES[(int) $member->q3_sex] ?? null,
            'birthdate' => $this->birthdateOf($member),
            /*
             * A month's worth of approximation, and the record says so. A
             * clerk about to put this on a certificate needs to know it came
             * from a census and not a birth certificate.
             */
            'birthdate_is_estimated' => true,
            'birth_place' => $member->q6_birthplace ?: null,
            'civil_status' => $civil,
            'email' => $member->email ?: null,
            'contact_number' => $member->contact_number ?: null,
            'household_id' => $household?->id,
            'zone_purok' => $census->zone_purok,
            // Everybody on a household census sheet lives there. Q36 asks
            // something else entirely, and is not this question.
            'residency_status' => 'Permanent',
            /*
             * Q35 already asked how long they have lived here, and the
             * register has a column for it — they were simply never joined
             * up. A certificate of indigency often has to state it, and an
             * office that has the answer on the census sheet should not be
             * asking the household for it a second time at the counter.
             *
             * Whole years. The months in Q35 are not dropped — they are on
             * the census line, which is where the finer answer lives.
             */
            'length_of_residence_years' => $member->q35_stay_years !== null
                ? (int) $member->q35_stay_years
                : null,
            'address' => trim(implode(', ', array_filter([
                $census->address_unit,
                $census->address_house_lot,
                $census->address_street,
            ]))) ?: null,
        ]);

        /*
         * The age-derived tags, from the register's own rule rather than a
         * second copy of it here — this is what puts a new senior citizen on
         * the sector list the day they are registered.
         */
        $resident->demographic_classification = $resident->primaryAgeClassification();
        $resident->save();

        foreach ($resident->ageSectors() as $sector) {
            $resident->sectors()->create([
                'sector_type' => $sector,
                'enrolled_date' => now()->toDateString(),
            ]);
        }

        return $resident;
    }

    /**
     * Says which resident a census line is.
     *
     * Matching only — it does not create anybody. A line that turns out to be
     * somebody new is registered through the resident form, where the office
     * asks everything the register needs and the census does not.
     */
    public function matchMember(Request $request, RbimCensus $rbimCensus, RbimCensusMember $member): JsonResponse
    {
        if (!$this->canReconcile()) {
            return $this->forbidden('Only the Population Office reconciles a census');
        }

        if ($member->rbim_census_id !== $rbimCensus->id) {
            return $this->error('That line is not on this census form.', 404);
        }

        $validated = $request->validate([
            'resident_id' => 'nullable|exists:residents,id',
        ]);

        $residentId = $validated['resident_id'] ?? null;

        // One resident per form: the same person cannot be two lines of one
        // household, and a double match is how a census inflates a household.
        if ($residentId) {
            $taken = $rbimCensus->members()
                ->where('resident_id', $residentId)
                ->where('id', '!=', $member->id)
                ->exists();

            if ($taken) {
                return $this->error(
                    'That resident is already matched to another line on this form.',
                    409
                );
            }
        }

        $member->update(['resident_id' => $residentId]);

        /*
         * The contact details go with the person.
         *
         * This is the whole reason they are collected: a resident with no
         * email on file cannot be given a portal account. Carried over only
         * where the register has NOTHING — a census is what one household
         * said on one evening, and it does not get to overwrite an address
         * the office already holds.
         */
        $carried = [];

        if ($residentId) {
            $resident = Resident::find($residentId);

            if ($resident) {
                if ($member->email && !$resident->email) {
                    // The register keeps one login per address, so a clash is
                    // reported rather than written.
                    $taken = Resident::where('email', $member->email)
                        ->where('id', '!=', $resident->id)->exists();

                    if ($taken) {
                        $carried[] = 'the email ' . $member->email
                            . ' already belongs to another resident, so it was not copied across';
                    } else {
                        $resident->forceFill(['email' => $member->email])->save();
                        $carried[] = 'their email was added, so a portal account can be issued';
                    }
                }

                if ($member->contact_number && !$resident->contact_number) {
                    $resident->forceFill(['contact_number' => $member->contact_number])->save();
                    $carried[] = 'their phone number was added';
                }
            }
        }

        /*
         * The house follows the household.
         *
         * The census is one household — that is what the form is. So once a
         * line is matched, the resident behind it belongs to that household,
         * and making the clerk open each profile afterwards to say so again
         * is asking the same question twice and getting it wrong once.
         *
         * Where the household comes from, in order:
         *   1. the household this form was explicitly linked to, or
         *   2. whichever household the HEAD's line was matched into — the
         *      head is line 1 and matched first, so by the time anybody
         *      else is matched it is usually already known.
         *
         * Nothing is invented: if neither is known, the resident's own
         * household is left exactly as it was.
         */
        $note = '';

        if ($residentId) {
            $householdId = $rbimCensus->household_id ?: $this->headHouseholdOf($rbimCensus);

            if ($householdId) {
                $resident = Resident::find($residentId);

                if ($resident && $resident->household_id !== $householdId) {
                    $resident->forceFill(['household_id' => $householdId])->save();

                    $house = Household::find($householdId);
                    $note = ' They are now recorded in household '
                        . ($house?->household_number ?? '#' . $householdId) . '.';
                }

                // Remembered on the form, so the next line matched does not
                // have to work it out again.
                if (!$rbimCensus->household_id) {
                    $rbimCensus->forceFill(['household_id' => $householdId])->save();
                }
            }
        }

        return $this->success(
            $member->load('resident:id,resident_number,first_name,last_name'),
            $residentId
                ? $member->full_name . ' matched to the register.' . $note
                    . ($carried !== [] ? ' Also: ' . implode('; ', $carried) . '.' : '')
                : 'Match removed.'
        );
    }

    public function destroy(RbimCensus $rbimCensus): JsonResponse
    {
        if (!$this->canReconcile()) {
            return $this->forbidden('Only the Population Office may delete a census form');
        }

        /*
         * A submitted census has people on the register behind it. Deleting
         * the form would leave those records with nothing saying where they
         * came from.
         */
        if ($rbimCensus->status === 'Submitted') {
            return $this->error(
                'This census has been submitted and its household registered. '
                    . 'It is part of the record and cannot be deleted.',
                409
            );
        }

        $number = $rbimCensus->census_no;
        $rbimCensus->delete();

        return $this->success(null, 'RBIM census ' . $number . ' deleted.');
    }

    /* ------------------------------------------------------------------ */

    /**
     * The household of whoever was matched to the head's line.
     *
     * Q2 = 1 is "Head" on the form; falling back to line 1 covers a census
     * where the relationship column was left blank, which happens.
     */
    private function headHouseholdOf(RbimCensus $census): ?int
    {
        $head = $census->members()
            ->whereNotNull('resident_id')
            ->orderByRaw('q2_relationship = 1 DESC')
            ->orderBy('line_no')
            ->with('resident:id,household_id')
            ->first();

        return $head?->resident?->household_id;
    }

    /**
     * Turns Q2 into the family links the register keeps.
     *
     * Without this, a household registered from a census is a list of people
     * who happen to share an address — which is all the register would know
     * about a married couple and their children. Every person now arrives
     * this way, so Q2 is the only thing that ever says otherwise.
     *
     * Only the codes that say something unambiguous:
     *
     *   02 Spouse         married to the head.
     *   03 Son            a child of the head, and of the head's spouse
     *   04 Daughter       where there is one.
     *
     * Everything else is left alone, deliberately. A grandson (09) is the
     * child of one of the head's children, and the sheet does not say which;
     * an in-law belongs to a marriage the sheet does not record; a boarder is
     * not family at all. Guessing at those would put relationships in the
     * register that nobody stated.
     *
     * Stepson and stepdaughter (05, 06) are recorded on the line and linked
     * to nobody: the register does not model step relationships, and their
     * own two parents belong on their record instead.
     *
     * Safe to run again. A form re-submitted after an edit finds the links
     * already there and adds nothing.
     *
     * @return string[] what it did, for the office to read
     */
    private function buildFamilyFrom($lines): array
    {
        $notes = [];

        $residentOf = fn ($line) => $line?->resident_id ? Resident::find($line->resident_id) : null;

        $head = $residentOf($lines->first());

        if (!$head) {
            return $notes;
        }

        $spouseLine = $lines->first(fn ($m) => (int) $m->q2_relationship === 2);
        $spouse = $residentOf($spouseLine);

        if ($spouse && $spouse->id !== $head->id && $head->spouse_id !== $spouse->id) {
            /*
             * Q2 says WHO; Q8 says what kind of union. A couple who both
             * answered Living-in are recorded as partners rather than
             * married — that is true of them, and it is the answer that
             * their own civil status already carries.
             */
            $liveIn = (int) $lines->first()->q8_marital_status === 3
                && (int) $spouseLine->q8_marital_status === 3;

            $head->marryTo($spouse, null, $liveIn ? ResidentMarriage::LIVE_IN : 'Married');

            $notes[] = $spouse->full_name . ' is recorded as the '
                . ($liveIn ? 'partner' : 'spouse') . ' of ' . $head->full_name . '.';
        }

        $children = $lines->filter(fn ($m) => in_array((int) $m->q2_relationship, [3, 4], true));
        $linked = [];

        foreach ($children as $line) {
            $child = $residentOf($line);

            if (!$child || $child->id === $head->id) {
                continue;
            }

            $childRole = Resident::roleLabel($child->gender, 'child');

            $head->children()->syncWithoutDetaching([$child->id => [
                'parent_role' => Resident::roleLabel($head->gender, 'parent'),
                'child_role' => $childRole,
            ]]);

            /*
             * And the head's spouse, because a census line that says "Son"
             * says son OF THE HOUSEHOLD, and a child with one parent on file
             * is a child the other parent's record does not know about.
             */
            if ($spouse && $spouse->id !== $child->id) {
                $spouse->children()->syncWithoutDetaching([$child->id => [
                    'parent_role' => Resident::roleLabel($spouse->gender, 'parent'),
                    'child_role' => $childRole,
                ]]);
            }

            $linked[] = $child->full_name;
        }

        if ($linked !== []) {
            $notes[] = count($linked) . ' ' . (count($linked) === 1 ? 'child is' : 'children are')
                . ' linked to ' . ($spouse ? 'both parents' : $head->full_name) . '.';
        }

        return $notes;
    }

    /** How a census line and a resident record are said to be the same person. */
    private function nameKey(?string $first, ?string $last): string
    {
        return mb_strtolower(trim((string) $first) . '|' . trim((string) $last));
    }
    private function writeMembers(RbimCensus $census, array $members): void
    {
        foreach ($members as $index => $member) {
            $census->members()->create($member + [
                // The line number the paper uses, kept in the order given.
                'line_no' => $member['line_no'] ?? $index + 1,
            ]);
        }
    }

    /**
     * Validation for the whole form.
     *
     * Almost everything is nullable on purpose. A census is filled in at a
     * doorstep, sometimes over two visits, and a form that refuses to save
     * until every box is answered is a form that gets finished on paper and
     * never keyed in at all. What IS required is what makes the record
     * identifiable: a household head and a name on every line.
     */
    private function rules(?int $ignoreId = null): array
    {
        /*
         * 99 is an answer, not a gap.
         *
         * The form says it in its own margin: "For SKIPPED questions, write
         * 99" — and then names exactly when. Q11 is 99 for a four-year-old;
         * Q12 to Q14 are 99 below three and at twenty-five and over. It is
         * the paper's way of saying "asked, does not apply", which is a
         * different fact from a box nobody filled in, and the register has
         * to be able to hold both.
         */
        $in = fn (array $list) => 'nullable|integer|in:99,' . implode(',', array_keys($list));

        return [
            /*
             * Unique, now that a clerk types it.
             *
             * The number is copied off the paper, and the paper number is
             * what identifies the sheet when somebody goes looking for the
             * physical form. Two records sharing one makes that lookup
             * ambiguous, and nothing else on a census tells them apart.
             */
            'census_no' => [
                'nullable', 'string', 'max:20',
                Rule::unique('rbim_censuses', 'census_no')->ignore($ignoreId),
            ],
            'is_institutional' => 'boolean',

            /* A. Identification */
            'province' => 'nullable|string|max:100',
            'city_municipality' => 'nullable|string|max:100',
            'barangay' => 'nullable|string|max:100',
            // Not on the paper form. Every resident record carries a purok
            // and the sheet has nowhere to write one.
            'zone_purok' => 'nullable|string|max:100',
            'address_unit' => 'nullable|string|max:150',
            'address_house_lot' => 'nullable|string|max:150',
            'address_street' => 'nullable|string|max:150',
            'respondent_name' => 'nullable|string|max:150',
            'household_head_name' => 'required|string|max:150',
            'total_members' => 'nullable|integer|min:0|max:99',
            'household_id' => 'nullable|exists:households,id',

            /* H. Household questions */
            'q45_housing_tenure' => $in(RbimCensus::TENURES),
            'q46_lot_tenure' => $in(RbimCensus::TENURES),
            'q47_lighting_fuel' => $in(RbimCensus::LIGHTING_FUELS),
            'q47_other' => 'nullable|string|max:100',
            'q48_cooking_fuel' => $in(RbimCensus::COOKING_FUELS),
            'q48_other' => 'nullable|string|max:100',
            'q49_water_source' => $in(RbimCensus::WATER_SOURCES),
            'q49_other' => 'nullable|string|max:100',
            'q50a_garbage_disposal' => $in(RbimCensus::GARBAGE_DISPOSAL),
            'q50b_segregates' => $in(RbimCensus::YES_NO),
            'q51_toilet' => $in(RbimCensus::TOILETS),
            'q51_other' => 'nullable|string|max:100',
            'q52_building_type' => $in(RbimCensus::BUILDING_TYPES),
            'q53_outer_wall' => $in(RbimCensus::OUTER_WALLS),
            'q53_other' => 'nullable|string|max:100',
            'q54_female_death_age' => 'nullable|integer|min:0|max:120',
            'q54_female_death_cause' => 'nullable|string|max:150',
            'q55_child_death_age' => 'nullable|integer|min:0|max:5',
            'q55_child_death_sex' => $in(RbimCensusMember::SEXES),
            'q55_child_death_cause' => 'nullable|string|max:150',
            'q56_common_disease_1' => 'nullable|string|max:120',
            'q56_common_disease_2' => 'nullable|string|max:120',
            'q56_common_disease_3' => 'nullable|string|max:120',
            'q57_primary_need_1' => 'nullable|string|max:120',
            'q57_primary_need_2' => 'nullable|string|max:120',
            'q57_primary_need_3' => 'nullable|string|max:120',
            'q58_intend_barangay' => 'nullable|string|max:100',
            'q58_intend_municipality' => 'nullable|string|max:100',
            'q58_intend_province' => 'nullable|string|max:100',

            'consent_given' => 'boolean',
            'consent_name' => 'nullable|string|max:150',

            /* C. Encoding */
            'date_encoded' => 'nullable|date',
            'encoder_name' => 'nullable|string|max:150',
            'supervisor_name' => 'nullable|string|max:150',
            'notes' => 'nullable|string',

            /* The member grid */
            'members' => 'nullable|array|max:30',
            'members.*.line_no' => 'nullable|integer|min:1|max:30',
            'members.*.last_name' => 'required|string|max:100',
            'members.*.first_name' => 'required|string|max:100',
            'members.*.middle_name' => 'nullable|string|max:100',
            /*
             * Not on the paper form. A portal account is issued against an
             * email address and against nothing else, so a household typed
             * in entirely from a census would otherwise come out with nobody
             * able to sign in.
             */
            'members.*.email' => 'nullable|email|max:150',
            'members.*.contact_number' => 'nullable|string|max:40',
            'members.*.q2_relationship' => $in(RbimCensusMember::RELATIONSHIPS),
            'members.*.q3_sex' => $in(RbimCensusMember::SEXES),
            'members.*.q4_age' => 'nullable|integer|min:0|max:130',
            'members.*.q5_birth_month' => 'nullable|integer|min:1|max:12',
            'members.*.q5_birth_year' => 'nullable|integer|min:1900|max:' . date('Y'),
            // Whether this line becomes a resident record when the form is
            // submitted. Line 1 is the head and is registered regardless.
            'members.*.register_as_resident' => 'nullable|boolean',
            'members.*.q6_birthplace' => 'nullable|string|max:150',
            'members.*.q7_nationality' => $in(RbimCensusMember::NATIONALITIES),
            'members.*.q7_nationality_other' => 'nullable|string|max:100',
            'members.*.q8_marital_status' => $in(RbimCensusMember::MARITAL_STATUSES),
            'members.*.q9_religion' => 'nullable|string|max:100',
            'members.*.q10_ethnicity' => 'nullable|string|max:100',
            'members.*.q11_education' => $in(RbimCensusMember::EDUCATION_LEVELS),
            'members.*.q12_enrolled' => $in(RbimCensusMember::ENROLLMENT),
            'members.*.q13_school_level' => $in(RbimCensusMember::SCHOOL_LEVELS),
            'members.*.q14_school_place' => 'nullable|string|max:150',
            // A census answer about the resident, not barangay money.
            'members.*.q15_monthly_income' => 'nullable|numeric|min:0|max:99999999',
            'members.*.q16_income_source' => $in(RbimCensusMember::INCOME_SOURCES),
            'members.*.q17_work_status' => $in(RbimCensusMember::WORK_STATUSES),
            'members.*.q18_work_place' => 'nullable|string|max:150',
            'members.*.q19_delivery_place' => $in(RbimCensusMember::DELIVERY_PLACES),
            'members.*.q19_other' => 'nullable|string|max:100',
            'members.*.q20_birth_attendant' => $in(RbimCensusMember::BIRTH_ATTENDANTS),
            'members.*.q20_other' => 'nullable|string|max:100',
            'members.*.q21_immunization' => 'nullable|string|max:120',
            'members.*.q22_pregnancies' => 'nullable|integer|min:0|max:30',
            'members.*.q22_living_children' => 'nullable|integer|min:0|max:30',
            'members.*.q23_fp_method' => $in(RbimCensusMember::FP_METHODS),
            'members.*.q24_fp_source' => $in(RbimCensusMember::FP_SOURCES),
            'members.*.q24_other' => 'nullable|string|max:100',
            'members.*.q25_fp_intention' => $in(RbimCensusMember::YES_NO),
            'members.*.q25_detail' => 'nullable|string|max:150',
            'members.*.q26_health_insurance' => $in(RbimCensusMember::HEALTH_INSURANCE),
            'members.*.q26_other' => 'nullable|string|max:100',
            'members.*.q27_facility_visited' => $in(RbimCensusMember::FACILITIES),
            'members.*.q27_other' => 'nullable|string|max:100',
            'members.*.q28_visit_reason' => $in(RbimCensusMember::VISIT_REASONS),
            'members.*.q28_other' => 'nullable|string|max:100',
            'members.*.q29_disability' => $in(RbimCensusMember::DISABILITIES),
            'members.*.q30_solo_parent' => $in(RbimCensusMember::SOLO_PARENT),
            'members.*.q31_senior_registered' => $in(RbimCensusMember::YES_NO),
            'members.*.q32_voter_barangay' => 'nullable|string|max:100',
            'members.*.q33_residence_5yrs' => 'nullable|string|max:150',
            'members.*.q34_residence_6mos' => 'nullable|string|max:150',
            'members.*.q35_stay_years' => 'nullable|integer|min:0|max:130',
            'members.*.q35_stay_months' => 'nullable|integer|min:0|max:11',
            'members.*.q36_resident_type' => $in(RbimCensusMember::RESIDENT_TYPES),
            'members.*.q37_transfer_month' => 'nullable|integer|min:1|max:12',
            'members.*.q37_transfer_year' => 'nullable|integer|min:1900|max:' . date('Y'),
            'members.*.q38a_leave_reason' => $in(RbimCensusMember::LEAVE_REASONS),
            'members.*.q38b_leave_reason' => $in(RbimCensusMember::LEAVE_REASONS),
            'members.*.q38c_leave_reason' => $in(RbimCensusMember::LEAVE_REASONS),
            'members.*.q38_other' => 'nullable|string|max:120',
            'members.*.q39_will_return' => $in(RbimCensusMember::YES_NO),
            'members.*.q39_when' => 'nullable|string|max:60',
            'members.*.q40a_transfer_reason' => $in(RbimCensusMember::TRANSFER_REASONS),
            'members.*.q40b_transfer_reason' => $in(RbimCensusMember::TRANSFER_REASONS),
            'members.*.q40c_transfer_reason' => $in(RbimCensusMember::TRANSFER_REASONS),
            'members.*.q40_other' => 'nullable|string|max:120',
            'members.*.q41_intends_to_stay' => $in(RbimCensusMember::YES_NO),
            'members.*.q41_until' => 'nullable|string|max:60',
            'members.*.q42a_has_ctc' => $in(RbimCensusMember::YES_NO),
            'members.*.q42b_ctc_here' => $in(RbimCensusMember::YES_NO),
            'members.*.q43_training_interest' => $in(RbimCensusMember::TRAININGS),
            'members.*.q44_skill' => $in(RbimCensusMember::SKILLS),
            'members.*.q44_other' => 'nullable|string|max:120',
            'members.*.notes' => 'nullable|string',
        ];
    }
}
