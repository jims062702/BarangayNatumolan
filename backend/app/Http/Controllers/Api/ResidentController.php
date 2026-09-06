<?php

namespace App\Http\Controllers\Api;

use App\Models\Resident;
use App\Models\PopulationEvent;
use App\Models\ResidentSector;
use App\Models\ChatConversation;
use App\Models\Guardianship;
use App\Models\Household;
use App\Support\LandingCache;
use App\Support\SequenceNumber;
use App\Support\PortalAccount;
use App\Models\ResidentMarriage;
use App\Models\ResidentMergeRecord;
use App\Models\User;
use App\Support\ResidentMerge;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ResidentController extends BaseController
{
    /**
     * Display all residents
     */
    public function index(Request $request): JsonResponse
    {
        // Merged-away records are tombstones pointing at the surviving
        // resident; they must never appear as people in their own right.
        $query = Resident::whereNull('merged_into_id')
            ->with([
                'household',
                'sectors' => fn ($q) => $q->where('is_active', true),
                // Only the parts needed to name them and pick the right word.
                'spouse:id,first_name,middle_name,last_name,suffix,gender',
            ]);

        /*
         * Non-residents are relatives who live elsewhere. They are on the
         * register so families can be recorded, not because the barangay
         * serves them, so the registry list leaves them out unless asked.
         */
        if ($request->input('record_type') === Resident::NON_RESIDENT) {
            /*
             * ONLY the people who live elsewhere. Their own list, because
             * they are a different question: a bona fide resident is looked
             * up by purok and sector, and a non-resident by the family they
             * belong to and the town they are in. Mixed together, the BPO
             * cannot count either of them.
             */
            $query->where('record_type', Resident::NON_RESIDENT);
        } elseif (!$request->boolean('include_non_residents')) {
            $query->bonafide();
        }

        if ($request->filled('search')) {
            // Same word-by-word matching as every other resident lookup, so
            // "Juan Dela Cruz" works here too.
            $query->nameSearch($request->input('search'));
        }

        if ($request->filled('zone_purok')) {
            $query->where('zone_purok', $request->input('zone_purok'));
        }

        if ($request->filled('gender')) {
            $query->where('gender', $request->input('gender'));
        }

        if ($request->filled('sector')) {
            $query->whereHas('sectors', function ($q) use ($request) {
                $q->where('sector_type', $request->input('sector'));
            });
        }
        
        if ($request->input('record_type') === Resident::NON_RESIDENT) {
            // Why they are on the register at all: the family that named them.
            $query->with([
                'children:id,first_name,last_name',
                'parents:id,first_name,last_name',
            ]);
        }

        $residents = $query->paginate(20);

        /*
         * What to call each partner, worked out for the whole page at once.
         *
         * "Wife" and "Husband" say married; two people living together are
         * partners. Telling them apart needs the union record, and asking for
         * it row by row would be twenty queries a page — so the open unions
         * for everybody on this page are fetched in one go.
         */
        $spouseIds = $residents->getCollection()
            ->pluck('spouse_id')->filter()->all();

        $liveIn = [];

        if ($spouseIds !== []) {
            $ids = $residents->getCollection()->pluck('id')->all();

            $openUnions = ResidentMarriage::open()
                ->where(fn ($q) => $q->whereIn('resident_id', $ids)->orWhereIn('spouse_id', $ids))
                ->get(['resident_id', 'spouse_id', 'union_type']);

            foreach ($openUnions as $union) {
                if ($union->isLiveIn()) {
                    $liveIn[$union->resident_id] = true;
                    $liveIn[$union->spouse_id] = true;
                }
            }
        }

        $residents->getCollection()->transform(function ($resident) use ($liveIn) {
            $row = $resident->toArray();

            if ($resident->spouse) {
                $row['spouse_label'] = isset($liveIn[$resident->id])
                    ? 'Partner'
                    : Resident::roleLabel($resident->spouse->gender, 'spouse');
            }

            return $row;
        });

        /*
         * Why this list and the public population figure differ.
         *
         * The office must still be able to find somebody who has died —
         * their record carries family links and is referenced by
         * certificates already issued — so the list shows them. The
         * population count must not: they are not living here.
         *
         * Both are right, and the gap between them looks like a bug until
         * somebody says out loud what it is. So the list says it.
         */
        return $this->success(
            $residents->toArray() + [
                'not_in_population' => Resident::whereNull('merged_into_id')
                    ->bonafide()
                    ->where('is_active', false)
                    ->count(),
            ],
            'Residents retrieved successfully'
        );
    }

    /**
     * Store a new resident
     */
    /** Only the Population Office (and Admin) may add or edit residents. */
    private function canWriteRegistry(): bool
    {
        $user = auth()->user();

        return $user->office === 'Population' || $user->role === 'Admin';
    }

    public function store(Request $request): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        /*
         * A non-resident can be registered from here too — the commonest case
         * being a child's other parent who lives elsewhere and is not on the
         * register at all. Five fields, no portal account, not counted.
         */
        $isNonResident = $request->input('record_type') === Resident::NON_RESIDENT;

        $validated = $request->validate(
            $isNonResident ? $this->nonResidentRules() : $this->residentRules(),
            ['email.unique' => 'This email is already registered to another resident.']
        );

        if ($conflict = $this->namesakeCheck($request, $validated)) {
            return $conflict;
        }

        if ($isNonResident) {
            $validated['record_type'] = Resident::NON_RESIDENT;
        }

        $resident = $this->createResident($validated);

        /*
         * Registering a resident IS issuing their portal account. The BPO
         * used to create logins one at a time from each profile page, so most
         * residents never got one; now the account exists from the moment the
         * record does, and the resident activates it themselves with a code
         * emailed to them at first sign-in.
         */
        $account = PortalAccount::provision($resident, auth()->id());

        return $this->success(
            $this->withAccountNotice($resident, $account),
            $isNonResident
                ? $resident->full_name . ' was recorded as living outside the barangay.'
                : ($account['created']
                    ? 'Resident registered. A portal account was created and emailed to them.'
                    : 'Resident registered successfully.'),
            201
        );
    }

    /**
     * The little that is asked of someone who does NOT live in the barangay.
     *
     * A resident's mother two towns over still has to exist so the family can
     * be recorded, but asking her for a purok, a residency status or a length
     * of residence is asking for something that does not exist. A name, a
     * number and an address is all the barangay needs to reach her.
     */
    private function nonResidentRules(): array
    {
        return [
            'first_name' => 'required|string|max:100',
            'middle_name' => 'nullable|string|max:100',
            'last_name' => 'required|string|max:100',
            'suffix' => 'nullable|string|max:50',
            // Optional, but it is what turns "Parent" into "Mother" on the
            // child's record — every family word is derived from it.
            'gender' => 'nullable|in:Male,Female,Other',
            'contact_number' => 'nullable|string',
            'address' => 'nullable|string|max:255',
        ];
    }

    /**
     * Every field a resident record holds. Shared by registration and by the
     * Add parent / Add child / Add spouse forms, so a family member is
     * captured to exactly the same standard as anyone else in the registry
     * rather than as a bare name on someone else's record.
     */
    private function residentRules(): array
    {
        return [
            'first_name' => 'required|string|max:100',
            'middle_name' => 'nullable|string|max:100',
            /*
             * The one field that separates two people who share a name AND a
             * birthday — no amount of cleverer matching can, once those
             * agree. It is on the PSA birth certificate, and in Philippine
             * naming it IS the middle name, so it also recovers the middle
             * name for a record that has none.
             */
            'mother_maiden_name' => 'nullable|string|max:100',
            'last_name' => 'required|string|max:100',
            'suffix' => 'nullable|string|max:50',
            'gender' => 'required|in:Male,Female,Other',
            'birthdate' => 'required|date',
            'birth_place' => 'nullable|string|max:150',
            'civil_status' => 'nullable|string',
            /*
             * Not here. A resident sets their own occupation from the portal;
             * an office typing a neighbour's is a guess, and the guess is
             * what a livelihood programme gets planned around.
             */
            'contact_number' => 'nullable|string',
            // Email is optional, but must be unique because it becomes the
            // resident's portal login the moment the record is created.
            'email' => 'nullable|email|unique:residents,email',
            'household_id' => 'nullable|exists:households,id',
            'zone_purok' => 'required|string',
            'residency_status' => 'required|in:Permanent,Temporary,Migrant',
            'length_of_residence_years' => 'nullable|integer',
            'educational_attainment' => 'nullable|string',
            'demographic_classification' => 'nullable|in:Senior Citizen,PWD,Solo Parent,Youth,Child,Adult,Others',
            // Sector tags chosen on the form (age-based + manual toggles).
            'sectors' => 'nullable|array',
            'sectors.*' => 'string|max:100',
        ];
    }

    /**
     * Namesakes are ordinary in a barangay: two people really can be "Juan
     * Dela Cruz". So an existing match is a confirmation step, not a block —
     * the clerk is shown who already holds the name (with birthdate and purok
     * to tell them apart) and decides whether this is the same person or a
     * genuinely different one. Returns a 409 to send back, or null to proceed.
     */
    private function namesakeCheck(Request $request, array $validated): ?JsonResponse
    {
        if ($request->boolean('confirm_namesake')) {
            return null;
        }

        $namesakes = $this->possibleDuplicates($validated);

        if ($namesakes->isEmpty()) {
            return null;
        }

        // Everything matched is a different person → say so plainly and let
        // the clerk carry on, rather than crying duplicate at a real namesake.
        if ($namesakes->every(fn ($r) => $r->confidence === 'different_person')) {
            return $this->error(
                'Someone with this name is already registered, but with a different mother — so this is a different person. Confirm to continue.',
                409,
                ['namesakes' => $namesakes]
            );
        }

        /*
         * The headline states the STRONGEST thing the evidence supports, so a
         * clerk skimming it is not misled either way: a confirmed match must
         * not read as a maybe, and a maybe must not read as a certainty.
         */
        $message = match (true) {
            $namesakes->contains(fn ($r) => $r->confidence === 'confirmed')
                => 'Someone with this name, birthday AND mother\'s maiden name is already registered — this is the same person.',
            $namesakes->contains(fn ($r) => $r->confidence === 'unknown')
                => 'Someone with this exact name AND birthday is already registered. Record the mother\'s maiden name on both to tell them apart.',
            $namesakes->contains(fn ($r) => $r->match_reason === 'birthdate')
                => 'Someone with this surname and the SAME BIRTHDAY is already registered — very likely the same person.',
            default => 'A resident with this name is already registered.',
        };

        return $this->error($message, 409, ['namesakes' => $namesakes]);
    }

    /**
     * Records that might already BE this person.
     *
     * Matching on the full name alone was letting the commonest duplicate of
     * all straight through: the same person written down under a nickname —
     * "James" one year, "Jims" the next — who then ends up with their
     * certificates on one record and their family on the other. A shared
     * surname AND a shared birthdate is a far stronger signal than spelling,
     * so it counts as a match in its own right.
     *
     * @param  array<string,mixed>  $data
     */
    private function possibleDuplicates(array $data, ?int $excludeId = null)
    {
        $first = $data['first_name'] ?? null;
        $last = $data['last_name'] ?? null;
        $birthdate = $data['birthdate'] ?? null;

        return Resident::whereNull('merged_into_id')
            ->when($excludeId, fn ($q) => $q->where('id', '!=', $excludeId))
            ->where(function ($q) use ($first, $last, $birthdate) {
                $q->where(fn ($w) => $w->where('first_name', $first)->where('last_name', $last));

                if ($last && $birthdate) {
                    $q->orWhere(fn ($w) => $w->where('last_name', $last)->whereDate('birthdate', $birthdate));
                }
            })
            ->orderBy('birthdate')
            ->get(['id', 'resident_number', 'first_name', 'middle_name', 'mother_maiden_name',
                'last_name', 'suffix', 'birthdate', 'birth_place', 'zone_purok', 'household_id',
                'is_active', 'email'])
            ->each(fn ($candidate) => $this->gradeCandidate($candidate, $data))
            ->values();
    }

    /**
     * How sure we are that a candidate is the same person, and why.
     *
     * The name and the birthday get you as far as "maybe" and no further:
     * once both agree, the record holds nothing else to go on, and two
     * unrelated people sharing them is uncommon but real. The MOTHER'S MAIDEN
     * NAME is what resolves it — so it decides the verdict outright when both
     * records have it, and when they do not, the honest answer is that we
     * cannot tell and somebody has to go and find out.
     */
    private function gradeCandidate($candidate, array $data): void
    {
        $norm = fn (?string $v) => $v === null || trim($v) === ''
            ? null
            : preg_replace('/[^a-z]/', '', mb_strtolower($v));

        $sameFirst = $norm($candidate->first_name) === $norm($data['first_name'] ?? null);
        $sameBirthday = !empty($data['birthdate'])
            && $candidate->birthdate
            && $candidate->birthdate->toDateString()
                === \Illuminate\Support\Carbon::parse($data['birthdate'])->toDateString();

        $candidate->match_reason = $sameFirst && $sameBirthday
            ? 'both'
            : ($sameBirthday ? 'birthdate' : 'name');

        $mineMother = $norm($data['mother_maiden_name'] ?? null);
        $theirMother = $norm($candidate->mother_maiden_name);

        if ($mineMother !== null && $theirMother !== null) {
            if ($mineMother === $theirMother) {
                $candidate->confidence = 'confirmed';
                $candidate->verdict = "Same mother's maiden name — the same person.";
            } else {
                $candidate->confidence = 'different_person';
                $candidate->verdict = 'Different mother (' . $candidate->mother_maiden_name
                    . ') — two different people who happen to share a name.';
            }

            return;
        }

        if ($sameFirst && $sameBirthday) {
            // The genuinely undecidable case, and the only honest response is
            // to name the missing evidence rather than guess at it.
            $candidate->confidence = 'unknown';
            $candidate->verdict = 'Same name and the same birthday, but no mother\'s maiden name on '
                . ($theirMother === null ? 'that record' : 'this one')
                . '. Record it on both — it is on the PSA birth certificate — and the answer is decided.';

            return;
        }

        $candidate->confidence = 'likely';
        $candidate->verdict = $sameBirthday
            ? 'Same surname and birthday, different spelling of the first name — usually a nickname for the same person.'
            : 'Same name, different birthday — usually two different people.';
    }

    /**
     * Field-by-field differences, so the decision is made on evidence rather
     * than on two names that look alike.
     */
    private function differencesBetween(Resident $a, $b): array
    {
        $fields = [
            'middle_name' => 'Middle name',
            'mother_maiden_name' => "Mother's maiden name",
            'birthdate' => 'Birthdate',
            'birth_place' => 'Place of birth',
            'gender' => 'Sex',
            'civil_status' => 'Civil status',
            'zone_purok' => 'Purok',
            'contact_number' => 'Contact',
            'email' => 'Email',
        ];

        $out = [];

        foreach ($fields as $field => $label) {
            $mine = $a->{$field} instanceof \DateTimeInterface
                ? $a->{$field}->format('Y-m-d')
                : $a->{$field};
            $theirs = $b->{$field} instanceof \DateTimeInterface
                ? $b->{$field}->format('Y-m-d')
                : $b->{$field};

            if ((string) $mine !== (string) $theirs) {
                $out[] = ['label' => $label, 'keeper' => $mine ?: null, 'duplicate' => $theirs ?: null];
            }
        }

        return $out;
    }

    /** Writes the registry record and its sector tags. */
    private function createResident(array $validated): Resident
    {
        $sectors = collect($validated['sectors'] ?? [])->filter()->unique()->values();
        unset($validated['sectors'], $validated['confirm_namesake']);

        // Generate the record number, prefixed NR- for somebody who lives
        // elsewhere so the two kinds are told apart on sight.
        $validated['resident_number'] = $this->generateResidentNumber(
            ($validated['record_type'] ?? null) === Resident::NON_RESIDENT
        );

        $resident = Resident::create($validated);

        foreach ($sectors as $sectorType) {
            $resident->sectors()->create([
                'sector_type' => $sectorType,
                'enrolled_date' => now()->toDateString(),
            ]);
        }

        LandingCache::clearStats(); // refresh the public "at a glance" count
        $resident->load('sectors');

        return $resident;
    }

    /**
     * Attaches what happened to the portal account to the resident payload,
     * so the clerk learns immediately that (say) no email was on file and no
     * login could be issued, instead of discovering it weeks later.
     */
    private function withAccountNotice(Resident $resident, array $account): array
    {
        return $resident->toArray() + [
            'portal_account' => [
                'created' => $account['created'],
                'email' => $account['user']?->email,
                // Shown once so the clerk can tell the resident at the counter;
                // it is the standard Lastname + MMDDYY default either way.
                'password' => $account['password'],
                'reason' => $account['reason'],
            ],
        ];
    }

    /**
     * Get single resident
     */
    public function show(Resident $resident): JsonResponse
    {
        // Self-heal the age bracket if the resident has had a birthday since the
        // record was last touched (Child → Youth, etc.), so the view is current.
        $resident->reconcileAgeData();

        $resident->load([
            'household',
            'sectors' => fn ($q) => $q->where('is_active', true), // hide grown-out-of brackets
            'serviceRequests', 'certificates',
            'account:id,email,resident_id,is_active,activated_at', // null when no portal account yet
            // Two generations up, one down, and sideways: `parents.parents
            // .children` is what turns the grandparents into aunts and uncles,
            // and their children into cousins.
            'parents.parents.children.children', 'parents.children', 'children', 'spouse',
            // Who is raising them, and whom they are raising. Neither is
            // derived from anything, so neither appears unless it is loaded.
            'guardians', 'wards',
        ]);

        /*
         * array_merge, NOT `+`: the union operator keeps the LEFT side on a key
         * collision, and toArray() already carries raw `parents`, `children`
         * and `spouse` from the loaded relations — so the labelled cards below
         * were being silently thrown away, and this page showed parents with
         * no Father/Mother against them while the portal showed them fine.
         */
        $payload = array_merge(
            $resident->toArray(),
            $this->derivedRelatives($resident),
            $this->careArrangements($resident),
            $this->bloodline($resident)
        );

        /*
         * `residency_status` is NOT NULL DEFAULT 'Permanent' in the schema,
         * so every non-resident silently carries it — and a default is not
         * a fact. The verification counter already refuses to repeat it;
         * this endpoint feeds the profile and the edit form, and two
         * endpoints disagreeing about the same person is how the wrong one
         * ends up on a screen nobody thought to check.
         */
        if ($resident->isNonResident()) {
            $payload['residency_status'] = null;
            $payload['zone_purok'] = null;
            $payload['length_of_residence_years'] = null;
        }

        return $this->success($payload, 'Resident retrieved successfully');
    }

    /**
     * Registers a whole household in one go.
     *
     * This is how the register is actually filled. A BHW walks to a house,
     * the owner answers the door, and the owner names everybody living
     * there — one visit, one conversation, one list. Registering the owner
     * and then opening their profile to add each person separately turns
     * one visit into six forms, and the six are what get abandoned halfway.
     *
     * The head is created first, then each member is passed through the SAME
     * family endpoint the profile uses. Nothing here is a second
     * implementation: the spouse rule still attaches a child to both parents,
     * the guardianship rules still hold, the namesake check still fires.
     *
     * A member may also be linked to NOBODY — "Other household member". A
     * grandchild in a lolo's house is not the lolo's child, and forcing a
     * relation that fits the form rather than the family is worse than
     * leaving it for the office to record properly afterwards. They are
     * still registered, still in the household, still counted.
     *
     * All of it in one transaction. A half-registered household — the owner
     * on the register and three of the five children missing — is the worst
     * possible outcome, because nobody can tell by looking which three.
     */
    /**
     * Passed as the "other parent" when the clerk says there is not one.
     *
     * Null cannot say it: null already means "nobody has told us", which is
     * what lets link() fall back to the spouse. "There is no second parent"
     * is a different answer and has to survive as one.
     */
    private const NO_OTHER_PARENT = -1;

    public function storeHousehold(Request $request): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $request->validate([
            'head' => 'required|array',
            'members' => 'nullable|array',
            'members.*.relation' => 'required|in:spouse,child,parent,none',
            'members.*.other_parent' => 'nullable|array',
            'members.*.other_parent.kind' => 'required_with:members.*.other_parent|in:spouse,resident,outside,none',
            'members.*.other_parent.resident_id' => 'nullable|integer|exists:residents,id',
            'members.*.union_type' => 'nullable|in:' . implode(',', ResidentMarriage::UNION_TYPES),
            'make_household_head' => 'boolean',
        ]);

        $headData = $request->input('head');
        $members = $request->input('members', []);

        /*
         * Every person is validated BEFORE anybody is created. A household
         * that fails on the fifth member should not leave four behind, and
         * finding out one at a time is how that happens.
         */
        $headValidator = validator($headData, $this->residentRules());

        if ($headValidator->fails()) {
            return $this->error(
                'The household owner\'s details need attention.',
                422,
                ['head' => $headValidator->errors()->toArray()]
            );
        }

        foreach ($members as $index => $member) {
            $rules = ($member['record_type'] ?? null) === Resident::NON_RESIDENT
                ? $this->nonResidentRules()
                : $this->residentRules();

            $check = validator($member, $rules);

            // A parent living outside is created too, so their details are
            // checked here — with everybody else's, before the transaction
            // opens. Finding out halfway through is what leaves half a
            // household behind.
            if (($member['other_parent']['kind'] ?? null) === 'outside') {
                $parentCheck = validator($member['other_parent'], $this->nonResidentRules());

                if ($parentCheck->fails()) {
                    return $this->error(
                        'The other parent of member ' . ($index + 1) . ' needs attention.',
                        422,
                        ['members' => [$index => ['other_parent' => $parentCheck->errors()->toArray()]]]
                    );
                }
            }

            if ($check->fails()) {
                $name = trim(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? ''));

                return $this->error(
                    ($name !== '' ? $name : 'Member ' . ($index + 1)) . ' needs attention.',
                    422,
                    ['members' => [$index => $check->errors()->toArray()]]
                );
            }
        }

        /*
         * Duplicates, for the WHOLE household at once.
         *
         * The single-resident form pauses on each namesake and asks. Six
         * of those in a row is a form nobody finishes, and worse, the
         * clerk answers the fourth one without reading it. So every
         * possible match is gathered here and shown together on the
         * preview — one look, one decision, before anybody is created.
         */
        if (!$request->boolean('confirm_namesakes')) {
            $found = [];

            foreach (array_merge([$headData], $members) as $index => $candidate) {
                $matches = $this->possibleDuplicates([
                    'first_name' => $candidate['first_name'] ?? '',
                    'last_name' => $candidate['last_name'] ?? '',
                    'birthdate' => $candidate['birthdate'] ?? null,
                    'mother_maiden_name' => $candidate['mother_maiden_name'] ?? null,
                ]);

                if ($matches->isNotEmpty()) {
                    $found[] = [
                        'index' => $index,
                        'who' => $index === 0 ? 'Household owner' : 'Member ' . $index,
                        'name' => trim(($candidate['first_name'] ?? '') . ' ' . ($candidate['last_name'] ?? '')),
                        'namesakes' => $matches,
                    ];
                }
            }

            if ($found !== []) {
                return $this->error(
                    count($found) === 1
                        ? $found[0]['name'] . ' may already be on the register.'
                        : count($found) . ' of these people may already be on the register.',
                    409,
                    ['possible_duplicates' => $found]
                );
            }
        }

        $result = DB::transaction(function () use ($headData, $members, $request) {
            $head = $this->createResident(
                validator($headData, $this->residentRules())->validated()
                + ['confirm_namesake' => true]
            );

            // The owner of the house, when the form said so. Through
            // handOverTo so the house keeps a record of who owned it before
            // — a BHW registering a household often finds a new owner in a
            // house the register still credits to a parent.
            if ($request->boolean('make_household_head') && $head->household_id) {
                Household::find($head->household_id)?->handOverTo(
                    $head,
                    'Correction of record',
                    'Recorded during household registration.'
                );
            }

            $headAccount = PortalAccount::provision($head, auth()->id());
            $registered = [];
            $notes = [];

            /*
             * The partner is created before any child.
             *
             * A child is attached to the owner's partner as well as the
             * owner, which cannot happen if the partner does not exist yet.
             * The clerk enters a household in whatever order the owner says
             * it — "my two sons, and my wife" is how people talk — and
             * whether the children come out belonging to their mother should
             * not depend on that. PHP's sort is stable, so everything else
             * keeps the order it was typed in.
             */
            usort($members, fn ($a, $b) =>
                (($a['relation'] ?? '') === 'spouse' ? 0 : 1)
                <=> (($b['relation'] ?? '') === 'spouse' ? 0 : 1));

            foreach ($members as $member) {
                $relation = $member['relation'];
                unset($member['relation']);

                $isNonResident = ($member['record_type'] ?? null) === Resident::NON_RESIDENT;
                $data = validator(
                    $member,
                    $isNonResident ? $this->nonResidentRules() : $this->residentRules()
                )->validated();

                unset($data['confirm_namesake']);

                if ($isNonResident) {
                    $data['record_type'] = Resident::NON_RESIDENT;
                } else {
                    // Everybody in the house shares the house, unless told otherwise.
                    $data['household_id'] = $data['household_id'] ?? $head->household_id;
                    $data['zone_purok'] = $data['zone_purok'] ?: $head->zone_purok;
                }

                $person = $this->createResident($data);

                /*
                 * Who the second parent is, when the clerk said.
                 *
                 * Unanswered, link() keeps its own presumption that the
                 * owner's partner is the other parent — right for most
                 * households and wrong for the ones that matter, which is
                 * why the form now asks.
                 */
                $namedParent = null;
                $otherParentId = null;
                $kind = $relation === 'child' ? ($member['other_parent']['kind'] ?? null) : null;

                if ($kind === 'resident') {
                    $namedParent = Resident::find($member['other_parent']['resident_id']);
                } elseif ($kind === 'outside') {
                    // A parent living elsewhere is recorded lightly: a name and
                    // a contact, so the child's parentage is complete without
                    // counting them in the population.
                    $namedParent = $this->createResident(
                        validator($member['other_parent'], $this->nonResidentRules())->validated()
                        + ['record_type' => Resident::NON_RESIDENT]
                    );
                }

                if ($namedParent) {
                    $otherParentId = $namedParent->id;
                } elseif ($kind === 'none') {
                    // "There is no second parent" — said, not merely unsaid,
                    // so the spouse presumption must not fill the gap.
                    $otherParentId = self::NO_OTHER_PARENT;
                }
                // 'spouse', or no answer at all, leaves it null: link() then
                // attaches the child to the owner's partner, as before.

                if ($relation !== 'none') {
                    $notes = array_merge(
                        $notes,
                        $this->link(
                            $head,
                            $person,
                            $relation,
                            $member['relationship'] ?? null,
                            // Two people living together are partners, not a
                            // husband and a wife. Recording every intake as
                            // 'Married' put the wrong word on their record and
                            // is the same error as setting their civil status
                            // to Married would be.
                            $member['union_type'] ?? 'Married',
                            $otherParentId
                        )
                    );
                }

                /*
                 * Attached directly, not through link() — going back through
                 * it would apply the spouse presumption a second time, from
                 * the other parent's side, and hand the child a third parent.
                 */
                if ($namedParent && $namedParent->id !== $head->id) {
                    $namedParent->children()->syncWithoutDetaching([$person->id => [
                        'parent_role' => Resident::roleLabel($namedParent->gender, 'parent'),
                        'child_role' => Resident::roleLabel($person->gender, 'child'),
                    ]]);

                    $notes[] = $namedParent->full_name . ' is recorded as '
                        . $person->full_name . "'s other parent.";
                }

                $account = PortalAccount::provision($person, auth()->id());

                $registered[] = [
                    'id' => $person->id,
                    'resident_number' => $person->resident_number,
                    'name' => $person->full_name,
                    'relation' => $relation,
                    'portal_account_created' => $account['created'],
                ];
            }

            return [
                'head' => [
                    'id' => $head->id,
                    'resident_number' => $head->resident_number,
                    'name' => $head->full_name,
                    'portal_account_created' => $headAccount['created'],
                ],
                'members' => $registered,
                'family_notes' => $notes,
            ];
        });

        $count = count($result['members']) + 1;

        return $this->success(
            $result,
            $count === 1
                ? $result['head']['name'] . ' was registered.'
                : $count . ' people registered in one household, starting with '
                    . $result['head']['name'] . '.',
            201
        );
    }

    /**
     * Update resident
     */
    public function update(Request $request, Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $validated = $request->validate([
            'first_name' => 'string|max:100',
            'middle_name' => 'nullable|string|max:100',
            'last_name' => 'string|max:100',
            'suffix' => 'nullable|string|max:50',
            'gender' => 'in:Male,Female,Other',
            'birthdate' => 'date',
            'civil_status' => 'nullable|string',
            /* The resident's own — see the note on store(). */
            'contact_number' => 'nullable|string',
            'email' => ['nullable', 'email', Rule::unique('residents', 'email')->ignore($resident->id)],
            'household_id' => 'nullable|exists:households,id',
            'zone_purok' => 'string',
            'residency_status' => 'in:Permanent,Temporary,Migrant',
            'length_of_residence_years' => 'nullable|integer|min:0',
            'educational_attainment' => 'nullable|string',
            'remarks' => 'nullable|string',
            'is_active' => 'boolean',
        ], [
            'email.unique' => 'This email is already registered to another resident.',
        ]);

        // Classification is the age bracket, derived from birthdate — never set
        // by hand. Other categories (PWD, Solo Parent, …) are sector tags.
        $resident->fill($validated);
        if ($resident->birthdate) {
            $resident->demographic_classification = $resident->primaryAgeClassification();
        }
        $resident->save();

        $resident->load(['household', 'sectors']);
        LandingCache::clearStats(); // is_active/purok may have changed the counts

        return $this->success($resident, 'Resident updated successfully');
    }

    /**
     * Delete resident
     */
    /**
     * Deleting a resident CASCADES into their VAWC case, KP cases, health
     * records and issued certificates — one click would erase a survivor's
     * protection history and break public certificate verification.
     *
     * So a resident who appears in any protected record cannot be deleted;
     * they are deactivated instead, which removes them from active lists and
     * counts while leaving the record trail intact. Deletion stays available
     * only for a genuinely mistaken entry that nothing references yet.
     */
    public function destroy(Request $request, Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $blockers = $this->protectedRecordCounts($resident);

        if (array_sum($blockers) > 0) {
            // Opt-in deactivation, so the caller cannot deactivate by accident
            // while believing they deleted.
            if ($request->boolean('deactivate')) {
                $resident->update(['is_active' => false]);
                LandingCache::clearStats();

                return $this->success($resident, 'Resident deactivated. Their records were kept.');
            }

            return $this->error(
                'This resident has records that must be kept, so they cannot be deleted. Deactivate them instead.',
                409,
                ['blockers' => array_filter($blockers)]
            );
        }

        $removed = $this->purge($resident);
        LandingCache::clearStats();

        return $this->success(
            ['removed' => $removed],
            'Resident deleted. ' . ($removed === []
                ? 'Nothing else was attached to them.'
                : 'Also removed: ' . implode(', ', $removed) . '.')
        );
    }

    /**
     * Deletes the resident and everything that was only ever theirs.
     *
     * Most of the registry hangs off `residents` with ON DELETE CASCADE, so
     * sectors, family links, guardianships, marriages and the rest go on their
     * own. Four things did NOT: they were declared ON DELETE SET NULL, which
     * detaches a row instead of removing it, and left behind
     *
     *   - the PORTAL ACCOUNT, holding their email and password. Worse than
     *     untidy: that address still counted as taken, so re-registering the
     *     same person was refused because of an account nobody could reach.
     *   - their live-chat threads, re-labelled "Guest visitor" but still
     *     carrying whatever they had told the Secretary.
     *   - their service requests and population events, pointing at nobody.
     *
     * SET NULL is right for a REFERENCE to them — another resident's spouse
     * pointer, a merge receipt — and wrong for their own information. This is
     * the difference, written out.
     *
     * Sanctum tokens have no foreign key at all, so a live session would have
     * outlived the account it belonged to. They go first.
     *
     * Everything runs in one transaction: a half-purged resident — login gone,
     * record still standing — is worse than either outcome.
     *
     * @return string[] What was removed, in words, for the clerk.
     */
    private function purge(Resident $resident): array
    {
        $removed = [];

        DB::transaction(function () use ($resident, &$removed) {
            $account = $resident->account;

            if ($account) {
                // Any signed-in session, before the account it belongs to.
                $account->tokens()->delete();
                $email = $account->email;
                $account->delete();
                $removed[] = 'their portal account (' . $email . ')';
            }

            $chats = ChatConversation::where('resident_id', $resident->id)->pluck('id');

            if ($chats->isNotEmpty()) {
                DB::table('chat_messages')->whereIn('chat_conversation_id', $chats)->delete();
                ChatConversation::whereIn('id', $chats)->delete();
                $removed[] = $chats->count() . ' chat conversation(s)';
            }

            $requests = DB::table('service_requests')->where('resident_id', $resident->id)->count();

            if ($requests > 0) {
                DB::table('service_requests')->where('resident_id', $resident->id)->delete();
                $removed[] = $requests . ' service request(s)';
            }

            $events = DB::table('population_events')->where('resident_id', $resident->id)->count();

            if ($events > 0) {
                DB::table('population_events')->where('resident_id', $resident->id)->delete();
                $removed[] = $events . ' population event(s)';
            }

            // And the record itself. The cascades take the rest with it.
            /*
             * A house cannot be headed by somebody who no longer exists.
             *
             * households.household_head_id has NO foreign key on it, so the
             * database will not clear it and nothing complains: the row goes
             * on naming a resident id that is not there. Two households in
             * this register are still headed by resident #1, deleted weeks
             * ago — the household list shows a blank owner and no page says
             * why.
             *
             * Cleared, not reassigned. Who takes over a household is a
             * decision for the office, not something to infer from whoever
             * happens to live at the address.
             */
            $headed = Household::where('household_head_id', $resident->id)->get();

            foreach ($headed as $house) {
                // Recorded before the resident row goes: once it is deleted
                // there is nothing left to name as the previous owner, and
                // the house would simply appear to have never had one.
                $house->handOverTo(null, 'Owner moved out', 'The owner\'s record was deleted.');
            }

            if ($headed->isNotEmpty()) {
                $removed[] = $headed->count() . ' household(s) left without an owner '
                    . '(set one from the household record)';
            }

            $resident->delete();
        });

        return $removed;
    }

    /** Records whose loss would be unacceptable, keyed for the UI to explain. */
    private function protectedRecordCounts(Resident $resident): array
    {
        return [
            'VAWC cases' => $resident->vawcCases()->count(),
            'KP cases (as complainant)' => $resident->luponCases()->count(),
            'KP cases (as respondent)' => \App\Models\LuponCase::whereHas(
                'respondents',
                fn ($q) => $q->where('residents.id', $resident->id)
            )->count(),
            'Certificates issued' => $resident->certificates()->count(),
            'Health visits' => $resident->healthVisits()->count(),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Family
    |--------------------------------------------------------------------------
    | Parents, children and a spouse are captured as FULL resident records —
    | the same form, the same validation, the same automatic portal account —
    | because a mother entered as a name on her son's record is not in the
    | registry at all. Linking is what makes a household traceable in both
    | directions, and it is what gives a child their lola and lolo for free:
    | grandparents are simply the parents of their parents.
    */

    /** The identity fields a family card shows. */
    private function familyCardFields(): array
    {
        return ['id', 'resident_number', 'record_type', 'first_name', 'middle_name', 'last_name',
            'suffix', 'gender', 'birthdate', 'zone_purok', 'address', 'contact_number',
            'is_active', 'life_status', 'date_of_death'];
    }

    /** Everyone this resident is connected to, in both directions. */
    public function family(Resident $resident): JsonResponse
    {
        $resident->load([
            'parents.parents.children.children', 'parents.children', 'children', 'spouse',
            'guardians', 'wards',
        ]);

        return $this->success(
            $this->bloodline($resident)
                + $this->derivedRelatives($resident)
                + $this->careArrangements($resident),
            'Family retrieved'
        );
    }

    /**
     * Records that look like they are already this resident — the same person
     * entered twice. Offered on the profile so a split record can be repaired
     * instead of quietly staying split.
     */
    public function duplicates(Resident $resident): JsonResponse
    {
        $candidates = $this->possibleDuplicates([
            'first_name' => $resident->first_name,
            'last_name' => $resident->last_name,
            'birthdate' => $resident->birthdate?->toDateString(),
            'mother_maiden_name' => $resident->mother_maiden_name,
        ], $resident->id);

        // What actually differs, so a clerk can decide on evidence.
        $candidates->each(function ($candidate) use ($resident) {
            $candidate->differences = $this->differencesBetween($resident, $candidate);
        });

        return $this->success($candidates, 'Possible duplicate records');
    }

    /**
     * Folds a duplicate record into this one.
     *
     * Everything the duplicate holds — certificates, requests, family links,
     * household headship, sector tags, even its portal login — moves onto
     * this record. The duplicate is deactivated, never deleted: certificates
     * issued under its number have to stay verifiable.
     */
    public function merge(Request $request, Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $validated = $request->validate([
            'duplicate_id' => 'required|exists:residents,id',
        ]);

        $duplicate = Resident::findOrFail($validated['duplicate_id']);

        if ($duplicate->id === $resident->id) {
            return $this->error('A record cannot be merged into itself.', 422);
        }

        if ($duplicate->merged_into_id) {
            return $this->error('That record has already been merged into another one.', 409);
        }

        if ($resident->merged_into_id) {
            return $this->error('This record was itself merged away, so nothing can be merged into it.', 409);
        }

        $result = ResidentMerge::merge($resident, $duplicate);

        $movedCount = array_sum($result['moved']);

        return $this->success(
            [
                // The receipt id, so the caller can offer to undo it.
                'merge_id' => $result['record']->id,
                'moved' => $result['moved'],
                'notes' => $result['notes'],
            ],
            $duplicate->resident_number . ' was merged into ' . $resident->resident_number . '. '
                . ($movedCount > 0 ? $movedCount . ' record(s) moved across. ' : '')
                . implode(' ', $result['notes'])
                . ' This can be undone from the resident\'s profile.'
        );
    }

    /**
     * Merges this record has absorbed and can still take back.
     */
    public function merges(Resident $resident): JsonResponse
    {
        $records = ResidentMergeRecord::with('duplicate:id,resident_number,first_name,middle_name,last_name,suffix,birthdate')
            ->where('keeper_id', $resident->id)
            ->whereNull('reversed_at')
            ->latest()
            ->get()
            ->map(fn ($record) => [
                'id' => $record->id,
                'duplicate' => $record->duplicate,
                'notes' => $record->notes,
                'merged_at' => $record->created_at,
                'moved_total' => collect($record->moved ?? [])
                    ->flatMap(fn ($columns) => array_map('count', $columns))->sum(),
            ]);

        return $this->success($records, 'Reversible merges');
    }

    /**
     * Takes a merge back.
     *
     * Merging is a judgement made on incomplete evidence — two people really
     * can share a name and a birthday — so the office has to be able to undo
     * one without a database restore. This replays the receipt written at
     * merge time, so records that arrived on the keeper independently
     * afterwards are left exactly where they are.
     */
    public function unmerge(Request $request, Resident $resident, ResidentMergeRecord $merge): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        if ($merge->keeper_id !== $resident->id) {
            return $this->error('That merge does not belong to this record.', 422);
        }

        if ($merge->isReversed()) {
            return $this->error('That merge has already been undone.', 409);
        }

        $result = ResidentMerge::reverse($merge);

        return $this->success(
            $result,
            $result['duplicate']->resident_number . ' was separated out again and is active. '
                . 'Everything this merge moved has gone back to it.'
        );
    }

    /**
     * Every marriage this resident has been in, most recent first.
     *
     * The ended ones matter as much as the current one: they are what explain
     * why an older certificate names a different spouse, and a widow who
     * re-marries should not have her first marriage erased to record it.
     */
    public function marriages(Resident $resident): JsonResponse
    {
        $rows = ResidentMarriage::involving($resident->id)
            ->with(['resident:id,first_name,middle_name,last_name,suffix,gender',
                'spouse:id,first_name,middle_name,last_name,suffix,gender',
                'deceased:id,first_name,last_name'])
            ->orderByRaw('ended_on IS NOT NULL')   // open marriage first
            ->orderByDesc('id')
            ->get()
            ->map(function ($marriage) use ($resident) {
                $partner = $marriage->partnerOf($resident->id);

                return [
                    'id' => $marriage->id,
                    'partner' => $partner?->only(['id', 'first_name', 'middle_name', 'last_name', 'suffix', 'gender']),
                    'partner_name' => $partner?->full_name,
                    'union_type' => $marriage->union_type,
                    'married_on' => $marriage->married_on?->toDateString(),
                    'ended_on' => $marriage->ended_on?->toDateString(),
                    'end_reason' => $marriage->end_reason,
                    'end_notes' => $marriage->end_notes,
                    'deceased_name' => $marriage->deceased?->full_name,
                    'shown_to_children' => $marriage->shown_to_children,
                    'is_current' => !$marriage->hasEnded(),
                ];
            });

        return $this->success($rows, 'Marriage history retrieved');
    }

    /**
     * Ends a marriage and records WHY.
     *
     * The reason is required, because it is the whole point: a resident who
     * marries again has a history the barangay has to be able to explain, and
     * "no longer married" on its own explains nothing. Ending it also frees
     * both partners to be married again, and moves their civil status to
     * match — widowed, separated, or back to single.
     */
    public function endMarriage(Request $request, Resident $resident, ResidentMarriage $marriage): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        if ($marriage->resident_id !== $resident->id && $marriage->spouse_id !== $resident->id) {
            return $this->error('That marriage does not belong to this resident.', 422);
        }

        if ($marriage->hasEnded()) {
            return $this->error('That marriage has already been ended.', 409);
        }

        $validated = $request->validate([
            'end_reason' => 'required|in:' . implode(',', ResidentMarriage::END_REASONS),
            'ended_on' => 'nullable|date|before_or_equal:' . self::manilaToday(),
            'end_notes' => 'nullable|string|max:500',
            // Which partner died — required when the reason is a death, so
            // the SURVIVOR is the one marked widowed.
            'deceased_id' => 'nullable|exists:residents,id',
            // Consent: a separation is the parents' business, and only
            // appears on a child's own family view if the family agreed.
            'shown_to_children' => 'boolean',
        ]);

        $partner = $marriage->partnerOf($resident->id);

        if ($validated['end_reason'] === 'Widowed' && empty($validated['deceased_id'])) {
            return $this->error(
                'Record which partner passed away, so the other is the one marked widowed.',
                422
            );
        }

        if (!empty($validated['deceased_id'])
            && !in_array((int) $validated['deceased_id'], [$marriage->resident_id, $marriage->spouse_id], true)) {
            return $this->error('The person who passed away must be one of the two partners.', 422);
        }

        $marriage->forceFill([
            'ended_on' => $validated['ended_on'] ?? self::manilaToday(),
            'end_reason' => $validated['end_reason'],
            'end_notes' => $validated['end_notes'] ?? null,
            'deceased_id' => $validated['deceased_id'] ?? null,
            'shown_to_children' => $request->boolean('shown_to_children'),
        ])->save();

        // Both are single again as far as the registry is concerned.
        Resident::whereIn('id', [$marriage->resident_id, $marriage->spouse_id])
            ->update(['spouse_id' => null]);

        $status = $marriage->resultingCivilStatus();

        if ($status) {
            // A death widows only the survivor; everything else applies to both.
            $affected = $marriage->deceased_id
                ? array_values(array_diff([$marriage->resident_id, $marriage->spouse_id], [$marriage->deceased_id]))
                : [$marriage->resident_id, $marriage->spouse_id];

            Resident::whereIn('id', $affected)->update(['civil_status' => $status]);
        }

        return $this->success(
            ['marriage_id' => $marriage->id],
            'Marriage to ' . ($partner?->full_name ?? 'the spouse') . ' ended ('
                . $validated['end_reason'] . ').'
                . ($status ? ' Civil status updated to ' . $status . '.' : '')
                . ' A new spouse can now be recorded.'
                /*
                 * The commonest thing to happen next, and the one most often
                 * missed: the parent left raising the children may now qualify
                 * as a Solo Parent. Said as a prompt, not done automatically —
                 * it is a registration they have to make.
                 */
                . ($marriage->resident?->children()->exists() || $marriage->spouse?->children()->exists()
                    ? ' If either parent is now raising their children alone, they may register as a'
                        . ' Solo Parent (RA 8972); add the tag once they have the ID.'
                    : '')
        );
    }

    /**
     * Turns the children's consent on or off for one marriage.
     *
     * Kept separate from ending it because consent usually arrives later —
     * the separation is recorded on the day it happens, and whether the
     * children want it on their own page is a conversation for afterwards.
     */
    public function marriageVisibility(Request $request, Resident $resident, ResidentMarriage $marriage): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        if ($marriage->resident_id !== $resident->id && $marriage->spouse_id !== $resident->id) {
            return $this->error('That marriage does not belong to this resident.', 422);
        }

        $validated = $request->validate(['shown_to_children' => 'required|boolean']);

        $marriage->forceFill(['shown_to_children' => $validated['shown_to_children']])->save();

        return $this->success(null, $validated['shown_to_children']
            ? 'The children may now see how this marriage ended.'
            : 'This is hidden from the children again.');
    }

    /**
     * How this resident's parents' marriage ended — but ONLY where the family
     * has agreed the children may see it.
     *
     * A separation is the parents' business. It is always recorded on their
     * own records, because the barangay needs it; it reaches a child's family
     * page only with consent, which is what `shown_to_children` holds.
     */
    private function parentsMarriageNote(Resident $resident): ?array
    {
        $parentIds = $resident->parents->pluck('id');

        if ($parentIds->count() < 2) {
            return null;
        }

        $marriage = ResidentMarriage::whereNotNull('ended_on')
            ->where('shown_to_children', true)
            ->whereIn('resident_id', $parentIds)
            ->whereIn('spouse_id', $parentIds)
            ->with('deceased:id,first_name,middle_name,last_name,suffix')
            ->orderByDesc('ended_on')
            ->first();

        if (!$marriage) {
            return null;
        }

        return [
            'end_reason' => $marriage->end_reason,
            'ended_on' => $marriage->ended_on?->toDateString(),
            'deceased_name' => $marriage->deceased?->full_name,
        ];
    }

    /**
     * The partner card, labelled for the KIND of union it is.
     *
     * "Husband" and "Wife" say married. Two people living together are
     * partners, and printing the wrong word on the family page is the same
     * error as setting their civil status to Married would be.
     */
    private function spouseCard(Resident $resident): ?array
    {
        $card = $this->card($resident->spouse, 'spouse');

        if (!$card) {
            return null;
        }

        $union = $resident->currentMarriage();

        $card['union_type'] = $union?->union_type;

        if ($union?->isLiveIn()) {
            $card['relationship'] = 'Partner (live-in)';
        }

        return $card;
    }

    /**
     * Parents, children and spouse — with the step relationships kept in
     * their own groups rather than mixed in among them.
     *
     * A step-mother on a child's record is true and belongs there. Listing her
     * under "Parents" beside the mother is not: it reads as a claim about who
     * bore the child, and it is the claim the whole remarriage case turns on.
     */
    private function bloodline(Resident $resident): array
    {
        return [
            'parents' => $this->cards($resident->bloodParents(), 'parent'),
            'children' => $this->cards($resident->bloodChildren(), 'child'),
            'spouse' => $this->spouseCard($resident),
        ];
    }

    /**
     * The half of the family nobody types in: grandparents, siblings, aunts
     * and uncles, and cousins are all read back off the parent/child join, so
     * recording one grandparent makes a whole side of the family appear.
     */
    private function derivedRelatives(Resident $resident): array
    {
        return [
            'grandparents' => $this->cards($resident->grandparents(), 'grandparent'),
            /*
             * Half-brothers and half-sisters are named as such where the
             * register can prove it — a second family is exactly the case
             * this matters in, and "Brother" would flatten it.
             */
            'siblings' => collect($resident->siblings())
                ->map(fn ($sibling) => $this->card($sibling, $resident->siblingKind($sibling)))
                ->values(),
            'aunts_uncles' => $this->cards($resident->auntsAndUncles(), 'aunt_uncle'),
            'cousins' => $this->cards($resident->cousins(), 'cousin'),
            'parents_note' => $this->parentsMarriageNote($resident),
        ];
    }

    /**
     * Who is raising this child, whom this resident is raising, and the one
     * sentence a clerk needs about it.
     *
     * Kept apart from the derived relatives on purpose: nothing here is worked
     * out from anything. Guardianship is a fact somebody has to record, and
     * the whole point of the note below is to say so out loud when nobody has.
     */
    private function careArrangements(Resident $resident): array
    {
        return [
            'guardians' => $this->cards($resident->guardians, 'guardian'),
            'wards' => $this->cards($resident->wards, 'ward'),
            'past_guardians' => $this->pastGuardians($resident),
            'care_note' => $this->careNote($resident),
        ];
    }

    /** Arrangements that have ended — a child's care history is asked about. */
    private function pastGuardians(Resident $resident)
    {
        return $resident->guardianships()
            ->whereNotNull('ended_on')
            ->with('guardian:id,first_name,middle_name,last_name,suffix,gender')
            ->get()
            ->map(fn ($row) => [
                'id' => $row->id,
                'name' => $row->guardian?->full_name,
                'guardian_id' => $row->guardian_id,
                'relation' => $row->relation,
                'reason' => $row->reason,
                'started_on' => $row->started_on?->toDateString(),
                'ended_on' => $row->ended_on?->toDateString(),
                'end_reason' => $row->end_reason,
            ])
            ->values();
    }

    /**
     * The sentence that turns a gap in the register into something a clerk
     * can act on.
     *
     * The case it exists for: a child registered here as a bona fide resident
     * whose mother and father are both recorded outside the barangay. The
     * record looks complete — parents named, household set — while the one
     * thing the barangay actually needs, WHO TO KNOCK FOR, is nowhere on it.
     * Silence is the wrong answer, so the profile says it plainly.
     */
    private function careNote(Resident $resident): ?array
    {
        $guardians = $resident->guardians;

        if ($guardians->isNotEmpty()) {
            $primary = $guardians->firstWhere('pivot.is_primary', true) ?? $guardians->first();
            $relation = $primary->pivot?->relation;
            $reason = $primary->pivot?->reason;

            return [
                'kind' => 'recorded',
                'text' => 'In the care of ' . $primary->full_name
                    . ($relation ? ' (' . $relation . ')' : '')
                    . ($reason ? ' — ' . lcfirst($reason) : '') . '.',
            ];
        }

        // Not a minor, or a parent is here to raise them: nothing to flag.
        if (!$resident->isMinor() || !$resident->parentsAreAway()) {
            return null;
        }

        $away = $resident->parents
            ->map(fn ($parent) => $parent->isDeceased()
                ? $parent->full_name . ' has passed away'
                : $parent->full_name . ' lives outside the barangay')
            ->join('; ');

        return [
            'kind' => 'missing',
            'text' => 'Nobody is recorded as raising ' . $resident->first_name . '. ' . $away
                . '. Record the lola, tita or whoever the child lives with, so the barangay '
                . 'knows who to reach and who signs for them.',
        ];
    }

    /**
     * One family card, labelled for the group it is being shown in.
     *
     * A stored parent/child link carries a word for each end; everyone else is
     * labelled from their sex. Getting this wrong is what put "Son" beside a
     * resident's own father.
     */
    private function card($person, string $kind): ?array
    {
        if (!$person) {
            return null;
        }

        $stored = match ($kind) {
            'parent' => $person->pivot?->parent_role,
            'child' => $person->pivot?->child_role,
            // Lola, Tita, neighbour — the word for a carer is never a parent
            // word, and never derived from their sex.
            'guardian', 'ward' => $person->pivot?->relation,
            default => null,
        };

        $card = $person->only($this->familyCardFields())
            + ['relationship' => $stored ?: Resident::roleLabel($person->gender, $kind)];

        /*
         * A care arrangement has facts a plain family card has nowhere to put:
         * why the parents are not raising them, since when, and whether this
         * is the person to call first.
         */
        if (in_array($kind, ['guardian', 'ward'], true) && $person->pivot) {
            $card['guardianship'] = [
                'id' => $person->pivot->id,
                'reason' => $person->pivot->reason,
                'started_on' => $person->pivot->started_on,
                'is_primary' => (bool) $person->pivot->is_primary,
                'note' => $person->pivot->note,
            ];
        }

        return $card;
    }

    /** @return \Illuminate\Support\Collection<int,array> */
    private function cards($people, string $kind)
    {
        return collect($people)->map(fn ($person) => $this->card($person, $kind))->values();
    }

    /**
     * Turns a non-resident into a bona fide resident, because they moved in.
     *
     * A conversion rather than a new record: their family links, and anything
     * else already attached to them, come with them. Registering them afresh
     * would leave a duplicate behind and split the family in two — the exact
     * problem the merge tool exists to clean up.
     */
    public function convertToResident(Request $request, Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        if (!$resident->isNonResident()) {
            return $this->error('This person is already recorded as a barangay resident.', 409);
        }

        $rules = $this->residentRules();
        // Their own email must not collide with the record being converted.
        $rules['email'] = ['nullable', 'email', Rule::unique('residents', 'email')->ignore($resident->id)];

        $validated = $request->validate($rules, [
            'email.unique' => 'This email is already registered to another resident.',
        ]);

        $sectors = collect($validated['sectors'] ?? [])->filter()->unique()->values();
        unset($validated['sectors']);

        $validated['record_type'] = 'Resident';
        // Their outside address is replaced by a household and a purok here.
        $validated['address'] = null;
        /*
         * And a resident's number. Keeping the NR- one would leave a
         * constituent carrying the prefix that exists to say they are not
         * one — the exact confusion it was added to prevent. Nothing has
         * been issued against the old number: a non-resident cannot hold a
         * certificate, which is what makes renumbering safe here and not
         * safe for a resident.
         */
        $validated['resident_number'] = $this->generateResidentNumber();

        $resident->fill($validated);

        if ($resident->birthdate) {
            $resident->demographic_classification = $resident->primaryAgeClassification();
        }

        $resident->save();

        foreach ($sectors as $sectorType) {
            $resident->sectors()->firstOrCreate(
                ['sector_type' => $sectorType],
                ['enrolled_date' => now()->toDateString()]
            );
        }

        // Now that they live here, they get what every resident gets.
        $account = PortalAccount::provision($resident, auth()->id());

        LandingCache::clearStats(); // they now count towards the population

        $resident->load('sectors');

        return $this->success(
            $this->withAccountNotice($resident, $account),
            $resident->full_name . ' is now a registered barangay resident, and their family links '
                . 'came with them.'
                . ($account['created'] ? ' A portal account was created and emailed to them.' : '')
        );
    }

    /**
     * Records that a resident has passed away — or corrects it back.
     *
     * Death is not the same as deactivating a record, and treating it as one
     * loses everything that follows from it. So this does the whole thing:
     *
     *   - the person leaves the population figures (via `is_active`, which
     *     every count already filters on);
     *   - their FAMILY LINKS stay, because they are still somebody's father;
     *   - their portal login is switched off, because nobody should be
     *     signing in as them;
     *   - a marriage they were in ends as WIDOWED, with them named as the one
     *     who died, so the surviving spouse is marked widowed and is free to
     *     be recorded as married again;
     *   - a Death entry goes on the population register, where the office
     *     already keeps births, deaths and transfers.
     */
    public function updateLifeStatus(Request $request, Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $validated = $request->validate([
            'life_status' => 'required|in:Alive,Deceased',
            'date_of_death' => 'nullable|date|before_or_equal:' . self::manilaToday(),
            'note' => 'nullable|string|max:255',
        ]);

        // `nullable` means the key is simply ABSENT when nothing was sent,
        // so it is read once here rather than three times further down.
        $note = $validated['note'] ?? null;
        $becomingDeceased = $validated['life_status'] === Resident::DECEASED;

        if ($becomingDeceased && $resident->isDeceased()) {
            return $this->error('This resident is already recorded as deceased.', 409);
        }

        $dateOfDeath = $validated['date_of_death'] ?? self::manilaToday();

        if ($becomingDeceased && $resident->birthdate
            && $dateOfDeath < $resident->birthdate->toDateString()) {
            return $this->error('The date of death cannot be before the date of birth.', 422);
        }

        $notes = [];

        /*
         * All of it or none of it. This touches the resident, their portal
         * login, a marriage, the surviving spouse and the population
         * register; a failure part-way through used to leave the marriage
         * ended while the caller was told the whole thing had failed.
         */
        DB::transaction(function () use ($resident, $becomingDeceased, $dateOfDeath, $note, &$notes) {
        if ($becomingDeceased) {
            $resident->forceFill([
                'life_status' => Resident::DECEASED,
                'date_of_death' => $dateOfDeath,
                'life_status_note' => $note,
                // Every population count already filters on this, so they
                // leave the figures without a query having to change.
                'is_active' => false,
            ])->save();

            // Nobody should be able to sign in as them.
            $account = User::where('resident_id', $resident->id)->first();

            if ($account && $account->is_active) {
                $account->forceFill(['is_active' => false])->save();
                $notes[] = 'Their portal login (' . $account->email . ') was switched off.';
            }

            // A marriage they were in ended by death, not by choice.
            $marriage = $resident->currentMarriage();

            if ($marriage) {
                $partner = $marriage->partnerOf($resident->id);

                $marriage->forceFill([
                    'ended_on' => $dateOfDeath,
                    'end_reason' => 'Widowed',
                    'deceased_id' => $resident->id,
                ])->save();

                Resident::whereIn('id', [$marriage->resident_id, $marriage->spouse_id])
                    ->update(['spouse_id' => null]);

                if ($partner) {
                    $partner->forceFill(['civil_status' => 'Widowed'])->save();
                    $notes[] = $partner->full_name . ' is now recorded as widowed, and may be '
                        . 'recorded as married again.';
                }
            }

            PopulationEvent::create([
                'resident_id' => $resident->id,
                'event_type' => 'Death',
                'event_date' => $dateOfDeath,
                'description' => 'Recorded from the resident profile.'
                    . ($note ? ' ' . $note : ''),
                'verification_status' => 'Pending',
                'recorded_by' => auth()->id(),
            ]);

            $notes[] = 'A Death entry was added to the population register for verification.';
        } else {
            $resident->forceFill([
                'life_status' => 'Alive',
                'date_of_death' => null,
                'life_status_note' => $note,
                'is_active' => true,
            ])->save();

            /*
             * Correcting a death does NOT quietly undo what it caused: the
             * marriage was ended and a login was switched off, and silently
             * reversing those would be guessing at what the office wants.
             */
            $notes[] = 'Their record is active again. Check their marriage and portal login '
                . 'if those were changed when the death was recorded.';
        }
        });

        LandingCache::clearStats(); // the population figure has moved

        $resident->load('sectors');

        return $this->success(
            $resident,
            $becomingDeceased
                ? $resident->full_name . ' is recorded as deceased. Their family links are kept. '
                    . implode(' ', $notes)
                : $resident->full_name . ' is recorded as living again. ' . implode(' ', $notes)
        );
    }

    /**
     * Registers a NEW resident and links them to this one as a parent, child
     * or spouse in a single step — the "Add parent / Add child / Add spouse"
     * buttons on a profile. The body is an ordinary resident registration, so
     * the new person lands in the registry properly and gets their own portal
     * account like anybody else.
     */
    public function addRelative(Request $request, Resident $resident, string $relation): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        if (!in_array($relation, ['parent', 'child', 'spouse', 'guardian'], true)) {
            return $this->error('Relationship must be parent, child, spouse or guardian', 422);
        }

        /*
         * A relative who lives outside the barangay is recorded, but only
         * lightly: no purok, no residency status, no portal account. They can
         * be converted to a full resident later if they move in, and their
         * family history comes with them.
         */
        $isNonResident = $request->input('record_type') === Resident::NON_RESIDENT;

        $rules = $isNonResident ? $this->nonResidentRules() : $this->residentRules();
        // Mother / Father / Guardian, or Son / Daughter — free text so step-
        // and adoptive arrangements can be recorded as the barangay words them.
        $rules['relationship'] = 'nullable|string|max:40';
        /*
         * Parents very often live in their OWN house by the time their
         * children are registering families of their own. Recording that in
         * the same step is the difference between one form and three: pick
         * their household here, and make them its head if it is theirs.
         */
        $rules['make_household_head'] = 'boolean';
        // Married, or living together without being married.
        $rules['union_type'] = 'nullable|in:' . implode(',', ResidentMarriage::UNION_TYPES);
        /*
         * The child's OTHER parent, when the two are not married so there is
         * no spouse to infer them from. Without this, unmarried partners had
         * to enter every child twice — once on each of their records.
         */
        $rules['other_parent_id'] = 'nullable|exists:residents,id';
        /*
         * A guardianship, when the person being registered is the one raising
         * this child. Rare on this path — the lola is usually already on the
         * register, so `family/link` is the usual door — but a family that has
         * just moved in arrives all at once.
         */
        $rules['guardian_reason'] = 'nullable|string|max:60';
        $rules['guardian_started_on'] = 'nullable|date';
        $rules['guardian_note'] = 'nullable|string|max:255';
        $rules['is_primary'] = 'boolean';
        /*
         * Registering a CHILD who does not live with the parent being entered
         * — the commonest reason a child is registered at all when both
         * parents are away. The house comes from the guardian, and the
         * guardianship is recorded in the same step rather than left as a
         * second job the clerk has to remember.
         */
        $rules['guardian_id'] = 'nullable|exists:residents,id';
        $rules['guardian_relation'] = 'nullable|string|max:40';
        /*
         * What to do with children the partner already has. Left out, nothing
         * is done to them — see attachChildrenToNewSpouse.
         */
        $rules['existing_children'] = 'nullable|in:none,shared';

        $validated = $request->validate($rules, [
            'email.unique' => 'This email is already registered to another resident.',
        ]);

        if ($relation === 'spouse' && $resident->spouse_id) {
            return $this->error(
                $resident->full_name . ' is already recorded as partnered with '
                    . ($resident->spouse?->full_name ?? 'another resident')
                    . '. End that first — record whether it was a separation, '
                    . 'an annulment or a death — and this one can then be added.',
                409
            );
        }

        if ($conflict = $this->namesakeCheck($request, $validated)) {
            return $conflict;
        }

        $label = $validated['relationship'] ?? null;
        $makeHead = $request->boolean('make_household_head');
        $unionType = $validated['union_type'] ?? 'Married';
        $otherParentId = $validated['other_parent_id'] ?? null;
        $childrenAre = $validated['existing_children'] ?? null;
        $carerId = $validated['guardian_id'] ?? null;
        $carerRelation = $validated['guardian_relation'] ?? null;
        $guardian = [
            'reason' => $validated['guardian_reason'] ?? null,
            'started_on' => $validated['guardian_started_on'] ?? null,
            'note' => $validated['guardian_note'] ?? null,
            'is_primary' => $request->boolean('is_primary', true),
        ];
        unset(
            $validated['relationship'],
            $validated['make_household_head'],
            $validated['union_type'],
            $validated['other_parent_id'],
            $validated['guardian_reason'],
            $validated['guardian_started_on'],
            $validated['guardian_note'],
            $validated['is_primary'],
            $validated['existing_children'],
            $validated['guardian_id'],
            $validated['guardian_relation'],
        );

        /*
         * The person raising them, when one was named. Resolved before
         * anybody is created, so a bad id is a clean 422 rather than a
         * half-made child with no carer attached.
         */
        $carer = $carerId ? Resident::find($carerId) : null;

        if ($carerId && !$carer) {
            return $this->error('That guardian is not on the register.', 422);
        }

        if ($isNonResident) {
            $validated['record_type'] = Resident::NON_RESIDENT;
        } else {
            /*
             * A child left with a lola lives in HER house, not in the house of
             * the parent being entered — who is very often not in the barangay
             * at all. The guardian decides the address when there is one;
             * otherwise a relative at the same address is the common case.
             */
            $validated['household_id'] = $validated['household_id']
                ?? $carer?->household_id
                ?? $resident->household_id;

            if ($carer?->zone_purok && empty($validated['zone_purok'])) {
                $validated['zone_purok'] = $carer->zone_purok;
            }
        }

        $relative = $this->createResident($validated);
        $notes = $this->link(
            $resident, $relative, $relation, $label, $unionType, $otherParentId, $guardian, $childrenAre
        );

        /*
         * The unmarried equivalent of the spouse rule: a child belongs to both
         * parents whether or not there was a wedding.
         */
        if ($relation === 'child' && $otherParentId && $otherParentId !== $resident->id) {
            $otherParent = Resident::find($otherParentId);

            // `link()` has already handled them if they are also the spouse.
            if ($otherParent && !$otherParent->children()->where('residents.id', $relative->id)->exists()) {
                $otherParent->children()->syncWithoutDetaching([$relative->id => [
                    'parent_role' => Resident::roleLabel($otherParent->gender, 'parent'),
                    'child_role' => $label ?: Resident::roleLabel($relative->gender, 'child'),
                ]]);
                $notes[] = 'Also recorded as a child of ' . $otherParent->full_name . '.';
            }
        }

        if ($carer) {
            $notes = array_merge($notes, $this->recordGuardianship($relative, $carer, $carerRelation, [
                'reason' => $guardian['reason'],
                'started_on' => $guardian['started_on'],
                'note' => $guardian['note'],
                'is_primary' => true,
            ]));
        }

        if ($makeHead && $relative->household_id) {
            $household = Household::find($relative->household_id);
            $previous = $household?->head;

            // Same door as every other hand-over, so this one is in the
            // history too — this is exactly the "the house passed to the
            // next of kin" case.
            $household?->handOverTo($relative, 'Inherited', 'Recorded when adding a family member.');

            $notes[] = $previous && $previous->id !== $relative->id
                ? 'Now the owner of household ' . $household->household_number
                    . ', replacing ' . $previous->full_name . '.'
                : 'Now the owner of household ' . $household?->household_number . '.';
        }
        $account = PortalAccount::provision($relative, auth()->id());

        return $this->success(
            $this->withAccountNotice($relative, $account) + ['family_notes' => $notes],
            $this->linkMessage($resident, $relative, $relation, $notes, $account),
            201
        );
    }

    /**
     * Links two people who are BOTH already registered — the usual case for
     * parents, who are typically in the registry long before their children.
     */
    public function linkRelative(Request $request, Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $validated = $request->validate([
            'relative_id' => 'required|exists:residents,id',
            'relation' => 'required|in:parent,child,spouse,guardian',
            'relationship' => 'nullable|string|max:40',
            'union_type' => 'nullable|in:' . implode(',', ResidentMarriage::UNION_TYPES),
            // The usual door for a guardianship: the lola is almost always
            // already on the register, often as the head of the very
            // household the child was registered into.
            'guardian_reason' => 'nullable|string|max:60',
            'guardian_started_on' => 'nullable|date',
            'guardian_note' => 'nullable|string|max:255',
            'is_primary' => 'boolean',
            // See addRelative. Left out, the children already on the record
            // are not touched at all.
            'existing_children' => 'nullable|in:none,shared',
            /*
             * Who the child's second parent is.
             *
             * addRelative took this and this endpoint did not, so a child
             * ALREADY on the register could never be given their other
             * parent — and that is the ordinary case, because the child is
             * usually entered first and linked to a parent afterwards. The
             * fallback then attached them to whoever the subject happened to
             * be married to, which is a guess.
             */
            'other_parent_id' => 'nullable|exists:residents,id',
        ]);

        $relative = Resident::findOrFail($validated['relative_id']);

        if ($relative->id === $resident->id) {
            return $this->error('A resident cannot be their own relative.', 422);
        }

        if ($error = $this->linkBlocker($resident, $relative, $validated['relation'])) {
            return $this->error($error, 409);
        }

        $otherParentId = $validated['other_parent_id'] ?? null;

        $notes = $this->link(
            $resident,
            $relative,
            $validated['relation'],
            $validated['relationship'] ?? null,
            $validated['union_type'] ?? 'Married',
            $otherParentId,
            [
                'reason' => $validated['guardian_reason'] ?? null,
                'started_on' => $validated['guardian_started_on'] ?? null,
                'note' => $validated['guardian_note'] ?? null,
                'is_primary' => $request->boolean('is_primary', true),
            ],
            $validated['existing_children'] ?? null
        );

        /*
         * Naming the other parent has to ATTACH them, not merely stop the
         * spouse being assumed. Passing the id and getting a child with one
         * parent is the same silent failure as not asking at all.
         *
         * A step-child is left alone: link() has already refused to give
         * them a second parent, because their own two are recorded elsewhere.
         */
        if ($validated['relation'] === 'child'
            && $otherParentId
            && $otherParentId !== $resident->id) {

            $otherParent = Resident::find($otherParentId);

            if ($otherParent && !$otherParent->children()->where('residents.id', $relative->id)->exists()) {
                $otherParent->children()->syncWithoutDetaching([$relative->id => [
                    'parent_role' => Resident::roleLabel($otherParent->gender, 'parent'),
                    'child_role' => ($validated['relationship'] ?? null)
                        ?: Resident::roleLabel($relative->gender, 'child'),
                ]]);

                $notes[] = 'Also recorded as a child of ' . $otherParent->full_name . '.';
            }
        }

        return $this->success(
            ['family_notes' => $notes],
            $this->linkMessage($resident, $relative, $validated['relation'], $notes, null)
        );
    }

    /** Removes a family link that was recorded in error. */
    public function unlinkRelative(Request $request, Resident $resident, Resident $relative): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $relation = $request->query('relation');

        if (!in_array($relation, ['parent', 'child', 'spouse', 'guardian'], true)) {
            return $this->error('Specify which link to remove: parent, child, spouse or guardian', 422);
        }

        /*
         * Removing a guardianship DELETES it, because this is the undo for
         * one recorded against the wrong person. An arrangement that genuinely
         * came to an end is ended instead, which keeps the row — a child's
         * care history is exactly what gets asked about years later.
         */
        if ($relation === 'guardian') {
            Guardianship::where('ward_id', $resident->id)
                ->where('guardian_id', $relative->id)
                ->whereNull('ended_on')
                ->delete();

            return $this->success(null, 'Guardianship removed');
        }

        if ($relation === 'spouse') {
            // Marriage is mutual, so both sides have to be cleared.
            $resident->forceFill(['spouse_id' => null])->save();
            $relative->forceFill(['spouse_id' => null])->save();
        } elseif ($relation === 'parent') {
            $resident->parents()->detach($relative->id);
        } else {
            $resident->children()->detach($relative->id);
        }

        return $this->success(null, 'Family link removed');
    }

    /**
     * Why a link cannot be made. Kept separate from making it so both the
     * "add new" and "link existing" paths refuse the same things.
     */
    private function linkBlocker(Resident $resident, Resident $relative, string $relation): ?string
    {
        if ($relation === 'guardian') {
            /*
             * A parent raising their own child is not a guardianship — the
             * parent link already says it. Allowing both would put the same
             * person on the profile twice, in two roles, and leave the clerk
             * to work out which one the barangay means.
             */
            if ($resident->parents()->where('residents.id', $relative->id)->exists()) {
                return $relative->full_name . ' is recorded as ' . $resident->full_name
                    . "'s parent, so they do not also need to be recorded as their guardian.";
            }

            if (Guardianship::where('ward_id', $resident->id)
                ->where('guardian_id', $relative->id)
                ->whereNull('ended_on')->exists()) {
                return $relative->full_name . ' is already recorded as raising '
                    . $resident->full_name . '.';
            }

            // Two people cannot each be raising the other.
            if (Guardianship::where('ward_id', $relative->id)
                ->where('guardian_id', $resident->id)
                ->whereNull('ended_on')->exists()) {
                return $resident->full_name . ' is already recorded as raising '
                    . $relative->full_name . ', so it cannot also be the other way round.';
            }

            return null;
        }

        if ($relation === 'spouse') {
            if ($resident->spouse_id && $resident->spouse_id !== $relative->id) {
                return $resident->full_name . ' is already recorded as married to someone else.';
            }
            if ($relative->spouse_id && $relative->spouse_id !== $resident->id) {
                return $relative->full_name . ' is already recorded as married to someone else.';
            }

            return null;
        }

        // A person cannot be their own ancestor: without this, one mistaken
        // click makes the family tree infinite and every page that walks it
        // hangs.
        [$child, $parent] = $relation === 'parent' ? [$resident, $relative] : [$relative, $resident];

        if ($this->isDescendant($parent, $child)) {
            return $parent->full_name . ' is already recorded below ' . $child->full_name
                . ' in the family tree, so this link would loop.';
        }

        return null;
    }

    /** Whether $person appears anywhere below $ancestor in the tree. */
    private function isDescendant(Resident $person, Resident $ancestor, int $depth = 0): bool
    {
        if ($person->id === $ancestor->id) {
            return true;
        }

        // Six generations is far more than a barangay register ever holds;
        // the limit is a stop against corrupt data, not a modelling choice.
        if ($depth >= 6) {
            return false;
        }

        foreach ($ancestor->children as $child) {
            if ($this->isDescendant($person, $child, $depth + 1)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Writes the link, and with it the consequences a clerk would otherwise
     * have to remember:
     *
     *   - a child added to one parent is also the child of that parent's
     *     spouse, because that is what a married couple's child is;
     *   - a newly recorded spouse inherits the children already on the record,
     *     for the same reason.
     *
     * Returns a plain-language list of what else changed, so the clerk sees
     * the tree the system just built rather than having to go looking.
     *
     * @return string[]
     */
    private function link(
        Resident $resident,
        Resident $relative,
        string $relation,
        ?string $label,
        string $unionType = 'Married',
        ?int $otherParentId = null,
        array $guardian = [],
        // 'shared' | null — whether the partner's existing children are this
        // new spouse's too. Null means "leave them alone".
        ?string $childrenAre = null
    ): array {
        $notes = [];

        /*
         * Nowhere near the parent/child join. Everything below derives family
         * from that table, and a carer written into it would be read back as
         * blood: her children as the ward's siblings, her parents as the
         * ward's grandparents.
         */
        if ($relation === 'guardian') {
            return $this->recordGuardianship($resident, $relative, $label, $guardian);
        }

        if ($relation === 'parent') {
            // The clerk chose a word for the PARENT; the child's own word is
            // derived, so the link reads correctly from either end.
            $resident->parents()->syncWithoutDetaching([$relative->id => [
                'parent_role' => $label ?: Resident::roleLabel($relative->gender, 'parent'),
                'child_role' => Resident::roleLabel($resident->gender, 'child'),
            ]]);

            return $notes;
        }

        if ($relation === 'child') {
            // Here the chosen word describes the CHILD, and the parent's is
            // the derived one — the mirror of the case above.
            $roles = [
                'parent_role' => Resident::roleLabel($resident->gender, 'parent'),
                'child_role' => $label ?: Resident::roleLabel($relative->gender, 'child'),
            ];

            $resident->children()->syncWithoutDetaching([$relative->id => $roles]);

            /*
             * The spouse is presumed to be the other parent — but only while
             * nobody has said otherwise. When the clerk names a DIFFERENT
             * other parent, that is a statement that this child is not the
             * spouse's, and attaching them anyway would put a child on the
             * record of someone who is not their parent.
             */
            $spouseIsTheOtherParent = $otherParentId === null
                || $otherParentId === $resident->spouse_id;

            if ($resident->spouse && $spouseIsTheOtherParent) {
                $resident->spouse->children()->syncWithoutDetaching([$relative->id => [
                    'parent_role' => Resident::roleLabel($resident->spouse->gender, 'parent'),
                    'child_role' => $roles['child_role'],
                ]]);
                $notes[] = 'Also recorded as a child of ' . $resident->spouse->full_name . '.';
            }

            return $notes;
        }

        $union = $resident->marryTo($relative, null, $unionType);

        /*
         * Marriage is a statement about civil status; living together is not.
         * Setting both partners to "Married" for a live-in union would be
         * recording something legally untrue about them.
         */
        if (!$union->isLiveIn()) {
            foreach ([$resident, $relative] as $person) {
                if ($person->civil_status !== 'Married') {
                    $person->forceFill(['civil_status' => 'Married'])->save();
                }
            }
        } else {
            $notes[] = 'Recorded as partners, not married — their civil status is unchanged.';
        }

        /*
         * Children already on either record. Neither side is touched unless
         * the clerk asked for it, and the answer given about ONE partner's
         * children says nothing about the other's — so it is not applied to
         * them. The new spouse is linked to the spouse, and to nobody else.
         */
        $notes = array_merge(
            $notes,
            $this->attachChildrenToNewSpouse($resident, $relative, $childrenAre),
            $this->attachChildrenToNewSpouse($relative, $resident, null)
        );

        /*
         * Solo Parent is a registration for someone raising children ALONE
         * (RA 8972), and it lapses on marrying or living in with a partner.
         * Leaving the tag standing would keep them on a benefits list they no
         * longer qualify for.
         */
        foreach ([$resident, $relative] as $person) {
            $tag = $person->sectors()
                ->where('sector_type', 'Solo Parent')
                ->where('is_active', true)
                ->first();

            if ($tag) {
                $tag->update([
                    'is_active' => false,
                    'unenrolled_date' => self::manilaToday(),
                    'note' => 'Ended automatically: recorded as ' . strtolower($unionType)
                        . ' with ' . ($person->id === $resident->id ? $relative->full_name : $resident->full_name) . '.',
                ]);
                $notes[] = $person->full_name . ' is no longer tagged Solo Parent — that status is '
                    . 'for a parent raising children alone, and ends on marrying or living in.';
            }
        }

        return $notes;
    }

    /**
     * What a new marriage does to the children ALREADY on the partner's record.
     *
     * By default: nothing. A marriage is between two people, and the children
     * one of them already has are not part of the transaction. The commonest
     * case by far is a remarriage, where writing anything onto those children
     * is wrong — and the wrong thing was being written silently, so a second
     * wife came out recorded as the mother of the first wife's children.
     *
     * One thing can be asked for instead, and it is the clerk's to choose:
     *
     *   'shared' — a first marriage whose children were entered before the
     *              wedding was. The spouse really is the other parent, and
     *              attaching them saves entering every child a second time.
     *
     * It cannot give a child a third parent: two are already on the record,
     * and no answer at a counter changes who they are. A child who already
     * has both is left exactly as they are, and the clerk is told so.
     *
     * @return string[]
     */
    private function attachChildrenToNewSpouse(
        Resident $parent,
        Resident $newSpouse,
        ?string $childrenAre
    ): array {
        $children = $parent->bloodChildren();

        if ($children->isEmpty()) {
            return [];
        }

        // Nothing asked for, nothing written.
        if ($childrenAre !== 'shared') {
            return [
                $parent->full_name . "'s " . $children->count() . ' existing child record(s) were '
                    . 'left as they are — their own parents are unchanged.',
            ];
        }

        $shared = [];
        $refused = [];

        foreach ($children as $child) {
            // Already connected either way — leave whatever is recorded alone.
            if ($newSpouse->children()->where('residents.id', $child->id)->exists()) {
                continue;
            }

            /*
             * The one thing a clerk cannot ask for. A child with a mother
             * and a father on record is not acquiring a second mother
             * because somebody remarried — that child is left alone and the
             * clerk is told why.
             */
            $hasOtherParent = $child->bloodParents()
                ->reject(fn ($p) => $p->id === $parent->id)
                ->isNotEmpty();

            if ($hasOtherParent) {
                $refused[] = $child->full_name;
                continue;
            }

            $newSpouse->children()->syncWithoutDetaching([$child->id => [
                'parent_role' => Resident::roleLabel($newSpouse->gender, 'parent'),
                'child_role' => Resident::roleLabel($child->gender, 'child'),
            ]]);

            $shared[] = $child->full_name;
        }

        $notes = [];

        if ($shared !== []) {
            $notes[] = count($shared) . ' existing child record(s) now also list '
                . $newSpouse->full_name . ' as a parent.';
        }

        if ($refused !== []) {
            $notes[] = implode(', ', $refused)
                . (count($refused) === 1 ? ' already has' : ' already have')
                . ' both parents on record and were left unchanged — '
                . $newSpouse->full_name . ' was not added to them.';
        }

        return $notes;
    }

    /**
     * Writes down that this child is being raised by this person.
     *
     * $resident is the ward and $relative the guardian, matching the way
     * every other link on this page reads: the person whose profile the clerk
     * is standing on comes first.
     */
    private function recordGuardianship(Resident $ward, Resident $guardian, ?string $relation, array $details): array
    {
        $notes = [];
        $isPrimary = $details['is_primary'] ?? true;

        /*
         * One name to call first. A child left with a couple has two guardians
         * and only one of them answers the phone, and silently letting the
         * most recent entry win is how the barangay rings the wrong person.
         */
        if ($isPrimary) {
            Guardianship::where('ward_id', $ward->id)
                ->whereNull('ended_on')
                ->update(['is_primary' => false]);
        }

        Guardianship::create([
            'ward_id' => $ward->id,
            'guardian_id' => $guardian->id,
            'relation' => $relation ?: null,
            'reason' => $details['reason'] ?? null,
            'started_on' => $details['started_on'] ?? null,
            'is_primary' => $isPrimary,
            'note' => $details['note'] ?? null,
            'recorded_by' => auth()->id(),
        ]);

        if ($isPrimary) {
            $notes[] = $guardian->full_name . ' is now the person the barangay contacts about '
                . $ward->first_name . '.';
        }

        /*
         * A child is normally registered into the house they actually sleep
         * in. When the guardian's household is a different one, one of the two
         * records is wrong, and it is far cheaper to say so now than to find
         * out during a house-to-house.
         */
        if ($ward->household_id && $guardian->household_id
            && $ward->household_id !== $guardian->household_id) {
            $notes[] = 'Note: ' . $ward->first_name . ' is recorded in a different household from '
                . $guardian->full_name . '. Check which house the child actually lives in.';
        }

        if ($ward->parentsAreAway()) {
            $notes[] = 'Both parents are recorded away from the barangay, so this is now the '
                . 'only contact on the child\'s record.';
        }

        return $notes;
    }

    /**
     * Ends a guardianship — the parents came home, the child turned 18.
     *
     * Ending rather than deleting. The row is the answer to "who was raising
     * this child in 2026?", which is asked long after the arrangement is over.
     */
    public function endGuardianship(Request $request, Resident $resident, Guardianship $guardianship): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        if ($guardianship->ward_id !== $resident->id) {
            return $this->error('That guardianship is not on this resident\'s record.', 404);
        }

        if ($guardianship->ended_on) {
            return $this->error('That guardianship has already ended.', 409);
        }

        $validated = $request->validate([
            'ended_on' => 'nullable|date|before_or_equal:today',
            'end_reason' => 'required|in:' . implode(',', Guardianship::END_REASONS),
            'note' => 'nullable|string|max:255',
        ]);

        $guardianship->update([
            'ended_on' => $validated['ended_on'] ?? now()->toDateString(),
            'end_reason' => $validated['end_reason'],
            'note' => $validated['note'] ?? $guardianship->note,
        ]);

        $guardianship->load('guardian');

        return $this->success(
            null,
            ($guardianship->guardian?->full_name ?? 'The guardian')
                . ' is no longer recorded as raising ' . $resident->first_name
                . ' — ' . lcfirst($validated['end_reason']) . '.'
        );
    }

    /** One sentence describing what the clerk just did. */
    private function linkMessage(Resident $resident, Resident $relative, string $relation, array $notes, ?array $account): string
    {
        $message = $relation === 'guardian'
            // Not "the guardian OF": a carer is doing something, not holding
            // a position on a family tree.
            ? $relative->full_name . ' is now recorded as raising ' . $resident->full_name . '.'
            : $relative->full_name . ' is now recorded as the '
                . ['parent' => 'parent', 'child' => 'child', 'spouse' => 'spouse'][$relation]
                . ' of ' . $resident->full_name . '.';

        if ($notes !== []) {
            $message .= ' ' . implode(' ', $notes);
        }

        if ($account && $account['created']) {
            $message .= ' A portal account was created and emailed to them.';
        }

        return $message;
    }
    /**
     * Lightweight household list for the searchable picker.
     *
     * Scales to a 20k+ registry by never sending the whole table: it is a
     * typeahead — pass `?q=` to match household no. / address / purok / owner
     * name (capped), or `?ids=` to hydrate specific pre-selected households
     * (e.g. the one already on a resident being edited). With no params it
     * returns the first page so the picker isn't empty when it opens.
     */
    public function householdOptions(Request $request): JsonResponse
    {
        $query = Household::with('head:id,first_name,last_name')
            ->select(['id', 'household_number', 'zone_purok', 'street_address', 'household_head_id']);

        // Hydrate specific households by id (to display an already-chosen value).
        if ($request->filled('ids')) {
            $ids = collect(explode(',', $request->input('ids')))
                ->map(fn ($v) => (int) trim($v))
                ->filter()
                ->all();

            return $this->success($query->whereIn('id', $ids)->get(), 'Household options retrieved');
        }

        if ($request->filled('q')) {
            $search = trim($request->input('q'));
            $query->where(function ($q) use ($search) {
                $q->where('household_number', 'like', "%{$search}%")
                  ->orWhere('street_address', 'like', "%{$search}%")
                  ->orWhere('zone_purok', 'like', "%{$search}%")
                  ->orWhereHas('head', function ($hq) use ($search) {
                      $hq->where('first_name', 'like', "%{$search}%")
                         ->orWhere('last_name', 'like', "%{$search}%");
                  });
            });
        }

        $households = $query->orderBy('household_number')->limit(25)->get();

        return $this->success($households, 'Household options retrieved');
    }

    /**
     * Search residents
     */
    public function search(Request $request): JsonResponse
    {
        // A blank term would otherwise fall through to an arbitrary slice of
        // the registry; the picker expects "type something to get matches".
        if (trim((string) $request->input('q')) === '') {
            return $this->success([], 'Search results');
        }

        // birthdate + purok travel with every result so two residents who
        // share a name can still be told apart at the moment of picking.
        /*
         * Which kind of record the caller wants.
         *
         * The filtering used to be done in the picker, AFTER the ten rows
         * came back — so a search for a non-resident mother named Maria
         * returned ten residents called Maria and then hid all of them. The
         * clerk saw "no matches" for somebody who was on file. A limit has
         * to be applied to the rows you actually want.
         */
        $only = $request->input('record_type');

        $residents = Resident::whereNull('merged_into_id')
            ->when($only === Resident::NON_RESIDENT, fn ($q) => $q->where('record_type', Resident::NON_RESIDENT))
            ->when($only === 'Resident', fn ($q) => $q->bonafide())
            ->nameSearch($request->input('q'))
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->limit(10)
            // Non-residents ARE offered here: linking a relative who lives
            // elsewhere is the whole reason they are on the register. The
            // record type travels so the picker can mark them.
            // `life_status` travels so the picker can warn before a
            // certificate is filed for someone who has passed away.
            ->get(['id', 'resident_number', 'record_type', 'life_status', 'first_name', 'middle_name', 'last_name', 'suffix', 'birthdate', 'zone_purok']);

        return $this->success($residents, 'Search results');
    }

    /**
     * Add resident to sector
     */
    public function addSector(Request $request, Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $validated = $request->validate([
            'sector_type' => 'required|string',
            'enrolled_date' => 'nullable|date',
            // The Solo Parent ID / PWD ID / 4Ps household number behind the tag.
            'reference_no' => 'nullable|string|max:60',
            'issued_on' => 'nullable|date',
            'valid_until' => 'nullable|date',
            'note' => 'nullable|string|max:255',
        ]);

        /*
         * Solo Parent is a STATUS under RA 8972, granted on registration and
         * carrying benefits — not something a clerk concludes from looking at
         * a household. Two things follow, and the register enforces both.
         */
        if ($validated['sector_type'] === 'Solo Parent') {
            // Someone with a partner on record is not raising children alone.
            if ($resident->spouse_id) {
                return $this->error(
                    $resident->full_name . ' is recorded as partnered with '
                        . ($resident->spouse?->full_name ?? 'someone')
                        . ', so they cannot be tagged Solo Parent. If that union has ended, '
                        . 'end it on their record first — with the reason — and the tag can '
                        . 'then be added.',
                    409
                );
            }

            // And the tag follows the ID, not the other way round.
            if (empty($validated['reference_no'])) {
                return $this->error(
                    'A Solo Parent ID or registration reference is required. Solo Parent is a '
                        . 'registration under RA 8972 — record the number from their ID, or '
                        . 'have them register first.',
                    422
                );
            }
        }

        // Age brackets are derived from birthdate — never assigned by hand.
        if (in_array($validated['sector_type'], Resident::AGE_SECTORS, true)) {
            return $this->error('Age brackets (Child, Youth, Adult, Senior Citizen) are set automatically from birthdate and cannot be added manually.', 422);
        }

        // A resident can only hold one row per sector_type (unique index), so
        // reactivate a soft-removed one instead of erroring on a duplicate.
        $existing = $resident->sectors()->where('sector_type', $validated['sector_type'])->first();
        if ($existing) {
            $existing->update($validated + ['is_active' => true, 'unenrolled_date' => null]);
        } else {
            $resident->sectors()->create($validated);
        }

        return $this->success(null, 'Resident added to sector successfully', 201);
    }

    /**
     * Remove a sector tag from a resident. Age-based tags (Child, Youth, Adult,
     * Senior) will be re-derived on the next `residents:sync-sectors` run.
     */
    public function removeSector(Resident $resident, ResidentSector $sector): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        if ($sector->resident_id !== $resident->id) {
            return $this->error('That sector tag does not belong to this resident', 422);
        }

        // Age brackets are auto-managed and re-derive on view; block manual removal.
        if (in_array($sector->sector_type, Resident::AGE_SECTORS, true)) {
            return $this->error('Age brackets are set automatically from birthdate and cannot be removed.', 422);
        }

        $sector->delete();

        return $this->success(null, 'Sector removed');
    }

    /**
     * Generate unique resident number
     */
    /**
     * The number on the record, and what it says at a glance.
     *
     * A non-resident is prefixed NR-. Both kinds live in one table and
     * appear in the same pickers and search results, and a clerk reading
     * "2026-000034" has no way to tell whether the person in front of them
     * is a constituent. NR-2026-0001 says it without being looked up.
     *
     * Residents keep the bare year-sequence they have always had. Their
     * numbers are printed on certificates already in people's hands and
     * quoted in the public verification page; renumbering them would
     * invalidate paper the barangay has issued.
     *
     * The two sequences are counted separately, so neither leaves gaps in
     * the other.
     */
    /**
     * The register's numbering lives on the model, because a census can also
     * put somebody on the register and the two have to issue the same shape
     * of number. The DEMO PLACEHOLDER parked at 2026-999999 is skipped there,
     * as any all-nines value is.
     */
    private function generateResidentNumber(bool $nonResident = false): string
    {
        return Resident::nextNumber($nonResident);
    }
}
