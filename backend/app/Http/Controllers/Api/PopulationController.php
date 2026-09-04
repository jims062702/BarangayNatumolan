<?php

namespace App\Http\Controllers\Api;

use App\Models\Household;
use App\Models\HouseholdOwnerChange;
use App\Models\PopulationEvent;
use App\Models\Resident;
use App\Mail\PortalActivationCode;
use App\Models\User;
use App\Support\PortalAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class PopulationController extends BaseController
{
    public function listHouseholds(Request $request)
    {
        /*
         * Enough of each person to answer "who is in this house?" — which is
         * a name, a sex, an age and what they are to the head. A list of bare
         * names answers none of it: two Juan Dela Cruzes in one household are
         * indistinguishable, and nothing says which is the child.
         *
         * `parents` and `spouse_id` come along because the relationship is
         * derived from them rather than stored twice.
         */
        $query = Household::with([
            'residents:id,household_id,resident_number,first_name,middle_name,last_name,suffix,gender,birthdate,spouse_id',
            'residents.parents:id',
            'head:id,first_name,middle_name,last_name,suffix',
        ]);

        if ($request->filled('zone_purok')) {
            $query->where('zone_purok', $request->zone_purok);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('household_number', 'like', "%{$search}%")
                  ->orWhere('street_address', 'like', "%{$search}%");
            });
        }

        $page = $query->paginate(20);

        /*
         * What each person is to the head, worked out from the family links
         * the register already holds. Only the ones the links actually say:
         * a spouse is a spouse and a child is a child, and everybody else is
         * left blank rather than guessed at — a household holds cousins,
         * boarders and grandparents, and the register does not claim to know
         * which without being told.
         */
        $page->getCollection()->transform(function (Household $household) {
            $headId = $household->household_head_id;

            $household->residents->each(function (Resident $person) use ($headId) {
                $person->relation_to_head = match (true) {
                    $person->id === $headId => 'Head',
                    $headId !== null && $person->spouse_id === $headId => 'Spouse',
                    $headId !== null && $person->parents->contains('id', $headId)
                        => Resident::roleLabel($person->gender, 'child'),
                    default => null,
                };

                // The join was only needed for the line above.
                $person->unsetRelation('parents');
            });

            return $household;
        });

        return $this->success($page, 'Households retrieved');
    }

    public function createHousehold(Request $request)
    {
        $validated = $request->validate([
            'household_number' => 'required|unique:households',
            'zone_purok' => 'required|string',
            'street_address' => 'required|string',
            'house_type' => 'nullable|string',
            'household_head_id' => 'nullable|exists:residents,id',
            'notes' => 'nullable|string',
        ]);

        // Created without the owner, then handed over — so the first owner
        // gets a history entry like every one after them, and the house has
        // a readable beginning rather than a name that was simply always
        // there.
        $firstOwner = $validated['household_head_id'] ?? null;
        unset($validated['household_head_id']);

        $household = Household::create($validated);

        if ($firstOwner) {
            $household->handOverTo(Resident::find($firstOwner));
        }

        $household->load('head:id,first_name,last_name');

        return $this->success($household, 'Household created', 201);
    }

    public function updateHousehold(Request $request, Household $household)
    {
        $validated = $request->validate([
            'household_number' => ['required', Rule::unique('households')->ignore($household->id)],
            'zone_purok' => 'required|string',
            'street_address' => 'required|string',
            'house_type' => 'nullable|string',
            'household_head_id' => 'nullable|exists:residents,id',
            'notes' => 'nullable|string',
        ]);

        /*
         * The owner is NOT changed here.
         *
         * This form edits the house — its number, purok, address. Letting it
         * also swap the owner is how a hand-over happens with no reason
         * attached and no entry in the history: the same field, edited among
         * five others, with nobody asked why. Changing hands has its own
         * endpoint, which asks.
         */
        $attemptedOwner = $validated['household_head_id'] ?? null;
        unset($validated['household_head_id']);

        $household->update($validated);

        if ($attemptedOwner && (int) $attemptedOwner !== (int) $household->household_head_id) {
            return $this->error(
                'Use the change-of-owner form to hand this house over — it records the '
                    . 'previous owner and asks why. Editing the household details cannot '
                    . 'change who owns it.',
                422,
                ['household_head_id' => ['Owner changes go through PUT households/{id}/head.']]
            );
        }

        $household->load([
            'head:id,first_name,last_name',
            'residents:id,household_id,first_name,last_name',
        ]);

        return $this->success($household, 'Household updated');
    }

    /**
     * Set (or change) a household's owner/head. Used by the resident-
     * registration flow to make the just-registered resident the head of a
     * household they created inline (the resident didn't exist yet when the
     * household was created, so the owner is linked afterwards).
     */
    public function setHouseholdHead(Request $request, Household $household)
    {
        $validated = $request->validate([
            'household_head_id' => 'nullable|exists:residents,id',
            'reason' => 'nullable|string|max:60',
            'note' => 'nullable|string|max:255',
            'changed_on' => 'nullable|date|before_or_equal:today',
        ]);

        $to = !empty($validated['household_head_id'])
            ? Resident::find($validated['household_head_id'])
            : null;

        /*
         * A house that already has an owner cannot change hands silently.
         *
         * Setting the FIRST owner needs no reason — nothing passed from
         * anybody. Replacing one does: "Sold" and "the owner died" leave
         * exactly the same value in the column and mean entirely different
         * things to the next clerk certifying who lives here. Without the
         * reason the register records that it happened and not what
         * happened, which is the half that gets asked about.
         */
        if ($household->household_head_id && empty($validated['reason'])) {
            return $this->error(
                'Say why the owner is changing — this house already has one ('
                    . ($household->head?->full_name ?? 'unknown') . ').',
                422,
                ['reason' => ['A reason is required when replacing an owner.']]
            );
        }

        $change = $household->handOverTo(
            $to,
            $validated['reason'] ?? null,
            $validated['note'] ?? null,
            $validated['changed_on'] ?? null
        );

        $household->load(['head:id,first_name,last_name', 'ownerChanges.from:id,first_name,last_name',
            'ownerChanges.to:id,first_name,last_name', 'ownerChanges.recorder:id,name']);

        return $this->success(
            $household,
            $change === null
                ? 'No change — that resident is already the owner.'
                : ($to
                    ? $to->full_name . ' is now the owner. The previous owner is kept in the history.'
                    : 'The house is now recorded without an owner, and the change is in the history.')
        );
    }

    /**
     * Every owner this house has had, newest first.
     *
     * Read separately from the household record because it grows without
     * limit and the list page has no use for it — a house sold three times
     * should not make the household index heavier for the ones sold none.
     */
    public function householdOwnerHistory(Household $household)
    {
        $changes = $household->ownerChanges()
            ->with(['from:id,resident_number,first_name,last_name',
                    'to:id,resident_number,first_name,last_name',
                    'recorder:id,name'])
            ->get();

        return $this->success([
            'household' => $household->only(['id', 'household_number', 'street_address', 'zone_purok']),
            'current_owner' => $household->head?->only(['id', 'resident_number', 'first_name', 'last_name']),
            'changes' => $changes,
            'reasons' => HouseholdOwnerChange::REASONS,
        ], 'Household owner history retrieved');
    }

    public function listEvents(Request $request)
    {
        $query = PopulationEvent::with(['resident:id,resident_number,first_name,last_name', 'recorder:id,name']);

        if ($request->filled('event_type')) {
            $query->where('event_type', $request->event_type);
        }
        if ($request->filled('verification_status')) {
            $query->where('verification_status', $request->verification_status);
        }

        return $this->success($query->orderByDesc('event_date')->paginate(20), 'Population events retrieved');
    }

    public function recordPopulationEvent(Request $request)
    {
        $validated = $request->validate([
            'event_type' => 'required|in:Birth,Death,Transfer In,Transfer Out,Address Change,Household Change,Residency Status Change',
            'resident_id' => 'nullable|exists:residents,id',
            'event_date' => 'required|date',
            'description' => 'required|string',
        ]);

        $validated['recorded_by'] = auth()->id();

        $event = PopulationEvent::create($validated);

        return $this->success($event, 'Population event recorded', 201);
    }

    public function verifyEvent(Request $request, PopulationEvent $event)
    {
        $validated = $request->validate([
            'verification_status' => 'required|in:Verified,Rejected',
            'verification_notes' => 'nullable|string',
        ]);

        $event->update($validated);

        return $this->success($event, 'Event verification updated');
    }

    /**
     * Counter lookup used before a certificate is issued.
     *
     * Being in the registry and holding a portal account are two different
     * things — a resident can be fully registered and simply never have been
     * issued a login. The response says which, so the desk can tell at a
     * glance whether to serve the person or route them to the BPO for an
     * account, instead of assuming "no account" means "not a resident".
     */
    public function verifyResident(Request $request)
    {
        // One letter is enough — the counter searches as the clerk types.
        $validated = $request->validate([
            'q' => 'required|string|min:1',
        ]);

        $residents = Resident::nameSearch($validated['q'])
            // A merged-away duplicate is a tombstone pointing at the record
            // that survived, not a second person. At a counter it would be
            // offered as somebody to serve.
            ->whereNull('merged_into_id')
            ->with('account:id,resident_id,email,is_active')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->limit(15)
            ->get([
                'id', 'resident_number', 'first_name', 'middle_name', 'last_name',
                'suffix', 'birthdate', 'zone_purok', 'residency_status', 'is_active',
                'record_type', 'address', 'life_status', 'date_of_death',
            ])
            ->map(function ($resident) {
                $account = $resident->account;
                $isNonResident = $resident->isNonResident();

                return [
                    'id' => $resident->id,
                    'resident_number' => $resident->resident_number,
                    'first_name' => $resident->first_name,
                    'middle_name' => $resident->middle_name,
                    'last_name' => $resident->last_name,
                    'suffix' => $resident->suffix,
                    'birthdate' => $resident->birthdate?->toDateString(),
                    'age' => $resident->birthdate?->age,
                    /*
                     * Whether this person is a CONSTITUENT at all. Without it
                     * the counter cannot tell a resident from a relative who
                     * lives in Riyadh, and the whole purpose of this page is
                     * to answer exactly that before a certificate is filed.
                     */
                    'record_type' => $resident->record_type,
                    'is_non_resident' => $isNonResident,
                    // Where they actually are, for the ones who are not here.
                    'address' => $isNonResident ? $resident->address : null,
                    /*
                     * Purok and residency belong to people who live here.
                     * `residency_status` is NOT NULL DEFAULT 'Permanent' in
                     * the schema, so every non-resident silently carries
                     * "Permanent" — a column default that reads on screen as
                     * a statement of fact, beside a person living abroad.
                     * It is not their status; it is the absence of one.
                     */
                    'zone_purok' => $isNonResident ? null : $resident->zone_purok,
                    'residency_status' => $isNonResident ? null : $resident->residency_status,
                    // Serving somebody who has died is worse than refusing them.
                    'life_status' => $resident->life_status,
                    'date_of_death' => $resident->date_of_death?->toDateString(),
                    'is_active' => $resident->is_active,
                    'has_portal_account' => (bool) $account,
                    'portal_account_active' => $account?->is_active,
                    'portal_email' => $account?->email,
                ];
            });

        return $this->success($residents, 'Verification lookup results');
    }

    public function getSectorList(Request $request, $sector)
    {
        $residents = Resident::bonafide()->whereHas('sectors', function ($q) use ($sector) {
            $q->where('sector_type', $sector)->where('is_active', true);
        })->paginate(20);

        return $this->success([
            'sector' => $sector,
            'count' => $residents->total(),
            'residents' => $residents,
        ], 'Sector list retrieved');
    }

    public function getAnalytics(Request $request)
    {
        // Non-residents are on the register only so families can be
        // linked; they are not part of the barangay's population.
        $totalPopulation = Resident::bonafide()->where('is_active', true)->count();
        $households = Household::count();

        return $this->success([
            'total_population' => $totalPopulation,
            'total_households' => $households,
            'average_household_size' => $households > 0 ? round($totalPopulation / $households, 2) : 0,
            'population_by_age_group' => $this->getAgeGroupDistribution(),
            'population_by_gender' => $this->getGenderDistribution(),
            'population_by_zone' => Resident::bonafide()->where('is_active', true)
                ->groupBy('zone_purok')
                ->selectRaw('zone_purok, count(*) as count')
                ->orderBy('zone_purok')
                ->get(),
            'events_this_year' => PopulationEvent::whereYear('event_date', date('Y'))
                ->groupBy('event_type')
                ->selectRaw('event_type, count(*) as count')
                ->get(),
            'portal_accounts' => User::where('role', 'Resident')->count(),
            'dependency' => $this->getDependencyRatios(),
            'migration' => $this->getMigrationSummary(),
            'growth' => $this->getGrowthSummary($totalPopulation),
            'sector_counts' => \App\Models\ResidentSector::where('is_active', true)
                ->groupBy('sector_type')
                ->selectRaw('sector_type, count(*) as count')
                ->orderByDesc('count')
                ->get(),
            'intervention' => $this->getInterventionShortlist(),
        ], 'Population analytics retrieved');
    }

    /**
     * Standard dependency groups: young (0-14) and old (65+) are dependants
     * carried by the working-age band (15-64). The dependency ratio is
     * dependants per 100 working-age residents.
     */
    private function getDependencyRatios(): array
    {
        // Non-residents are relatives elsewhere; a dependency ratio built
        // on them describes no population that exists.
        $ages = Resident::bonafide()->where('is_active', true)
            ->whereNotNull('birthdate')
            ->pluck('birthdate')
            ->map(fn ($b) => $b->age);

        $young = $ages->filter(fn ($a) => $a <= 14)->count();
        $working = $ages->filter(fn ($a) => $a >= 15 && $a <= 64)->count();
        $old = $ages->filter(fn ($a) => $a >= 65)->count();

        $ratio = fn ($count) => $working > 0 ? round(($count / $working) * 100, 1) : 0;

        return [
            'young_dependents' => $young,
            'working_age' => $working,
            'old_dependents' => $old,
            'unknown_age' => Resident::bonafide()->where('is_active', true)
                ->whereNull('birthdate')->count(),
            'youth_dependency_ratio' => $ratio($young),
            'old_age_dependency_ratio' => $ratio($old),
            'total_dependency_ratio' => $ratio($young + $old),
        ];
    }

    /** In- and out-migration recorded for the year, and the net movement. */
    private function getMigrationSummary(): array
    {
        $year = date('Y');
        $count = fn (string $type) => PopulationEvent::whereYear('event_date', $year)
            ->where('event_type', $type)
            ->count();

        $in = $count('Transfer In');
        $out = $count('Transfer Out');

        return [
            'year' => (int) $year,
            'in_migration' => $in,
            'out_migration' => $out,
            'net_migration' => $in - $out,
        ];
    }

    /**
     * Population change for the year: natural increase (births less deaths)
     * plus net migration, expressed against the current headcount.
     */
    private function getGrowthSummary(int $totalPopulation): array
    {
        $year = date('Y');
        $count = fn (string $type) => PopulationEvent::whereYear('event_date', $year)
            ->where('event_type', $type)
            ->count();

        $births = $count('Birth');
        $deaths = $count('Death');
        $natural = $births - $deaths;
        $net = $natural + ($count('Transfer In') - $count('Transfer Out'));

        // Growth is measured against the headcount at the start of the year,
        // i.e. the current total less this year's net change.
        $base = $totalPopulation - $net;

        return [
            'year' => (int) $year,
            'births' => $births,
            'deaths' => $deaths,
            'natural_increase' => $natural,
            'net_change' => $net,
            'growth_rate' => $base > 0 ? round(($net / $base) * 100, 2) : 0,
            'newly_registered' => Resident::whereYear('created_at', $year)->count(),
        ];
    }

    /**
     * Households carrying a vulnerability indicator — a shortlist for
     * possible intervention, NOT an official needs assessment. A household is
     * flagged when any member holds one of the priority sectors below.
     */
    private function getInterventionShortlist(): array
    {
        $indicators = ['4Ps Household', 'PWD', 'Solo Parent', 'Indigent', 'Unemployed', 'Pregnant Women'];

        $rows = Resident::bonafide()->where('is_active', true)
            ->whereNotNull('household_id')
            ->whereHas('sectors', fn ($q) => $q->where('is_active', true)->whereIn('sector_type', $indicators))
            ->with(['sectors' => fn ($q) => $q->where('is_active', true)->whereIn('sector_type', $indicators)])
            ->get(['id', 'household_id']);

        // Count each household once per indicator, however many members carry it.
        $byIndicator = [];
        foreach ($indicators as $indicator) {
            $byIndicator[$indicator] = $rows
                ->filter(fn ($r) => $r->sectors->contains('sector_type', $indicator))
                ->pluck('household_id')
                ->unique()
                ->count();
        }

        return [
            'households_flagged' => $rows->pluck('household_id')->unique()->count(),
            'by_indicator' => $byIndicator,
            'indicators' => $indicators,
        ];
    }

    public function getSectoralReport(Request $request)
    {
        $sectors = \App\Models\ResidentSector::where('is_active', true)
            ->groupBy('sector_type')
            ->selectRaw('sector_type, count(*) as count')
            ->orderByDesc('count')
            ->get();

        return $this->success($sectors, 'Sectoral report retrieved');
    }

    /* ------------------------------------------------------------------
     | Resident portal accounts — BPO is the only office that creates them
     | (verifies the person actually lives in Barangay Natumolan).
     * ---------------------------------------------------------------- */

    /**
     * Issues the portal account for a resident who has none.
     *
     * This is no longer how accounts are normally made: registering a
     * resident creates one automatically (see PortalAccount::provision). This
     * endpoint exists for the records that predate that, and for the resident
     * whose registration had no email address on file — so the office has one
     * button, not a form, and the login is always the same standard account
     * with the same default password and the same email activation.
     */
    public function createResidentAccount(Request $request, Resident $resident)
    {
        if (!$resident->is_active) {
            return $this->error('Cannot create an account for an inactive resident record', 422);
        }

        // The resident record is the source of truth for the login address,
        // so an account is issued by first putting an email on the record.
        $validated = $request->validate([
            'email' => [
                'nullable',
                'email',
                Rule::unique('residents', 'email')->ignore($resident->id),
                'unique:users,email',
            ],
        ], [
            'email.unique' => 'This email is already in use by another resident or account.',
        ]);

        if (!empty($validated['email'])) {
            $resident->update(['email' => $validated['email']]);
            $resident->refresh();
        }

        $account = PortalAccount::provision($resident, auth()->id());

        if (!$account['created']) {
            return $this->error($account['reason'], 422);
        }

        return $this->success([
            'user' => $account['user'],
            // Shown once so the office can tell the resident at the counter.
            'password' => $account['password'],
        ], 'Portal account created. The resident was emailed their sign-in details.', 201);
    }

    /**
     * Sends a fresh activation code to a resident who has not yet completed
     * their first sign-in — the counter answer to "I never got the email".
     */
    public function resendActivation(User $user)
    {
        if ($user->role !== 'Resident') {
            return $this->error('Only resident portal accounts can be managed here', 422);
        }

        if ($user->isActivated()) {
            return $this->error('This account is already activated.', 422);
        }

        $code = $user->issueActivationOtp();

        try {
            Mail::to($user->email)->send(new PortalActivationCode($user, $code));
        } catch (\Throwable $e) {
            Log::warning('Activation code resend failed', ['user_id' => $user->id, 'error' => $e->getMessage()]);

            return $this->error('The code could not be emailed right now. Please try again shortly.', 500);
        }

        return $this->success(null, 'A new activation code was emailed to ' . $user->email);
    }

    /** Change the password of a resident's existing portal account. */
    public function changeResidentPassword(Request $request, Resident $resident)
    {
        $user = User::where('resident_id', $resident->id)->first();
        if (!$user) {
            return $this->error('This resident does not have a portal account yet', 404);
        }

        $validated = $request->validate([
            'password' => 'required|min:6',
        ]);

        $user->update(['password' => Hash::make($validated['password'])]);

        return $this->success(null, 'Password updated');
    }

    public function listResidentAccounts(Request $request)
    {
        $query = User::with('resident:id,resident_number,first_name,last_name,zone_purok')
            ->where('role', 'Resident')
            // `activated_at` is what the list badges: an account exists for
            // every registered resident, but it does nothing until they enter
            // the emailed code.
            ->select(['id', 'name', 'email', 'role', 'office', 'is_active', 'activated_at', 'resident_id', 'created_at']);

        if ($request->filled('activation')) {
            $request->input('activation') === 'pending'
                ? $query->whereNull('activated_at')
                : $query->whereNotNull('activated_at');
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%"));
        }

        return $this->success($query->latest()->paginate(20), 'Resident accounts retrieved');
    }

    public function toggleResidentAccount(User $user)
    {
        if ($user->role !== 'Resident') {
            return $this->error('Only resident portal accounts can be managed here', 422);
        }

        $user->update(['is_active' => !$user->is_active]);

        // "Enabled", not "activated": activation is the resident entering the
        // code emailed to them, which this switch has nothing to do with.
        return $this->success($user, $user->is_active ? 'Account enabled' : 'Account disabled');
    }

    private function getAgeGroupDistribution()
    {
        $residents = Resident::bonafide()->where('is_active', true)->get(['birthdate']);

        $age = fn ($r) => $r->birthdate ? $r->birthdate->age : null;

        return [
            '0-5 years' => $residents->filter(fn ($r) => $age($r) !== null && $age($r) <= 5)->count(),
            '6-12 years' => $residents->filter(fn ($r) => $age($r) !== null && $age($r) > 5 && $age($r) <= 12)->count(),
            '13-18 years' => $residents->filter(fn ($r) => $age($r) !== null && $age($r) > 12 && $age($r) <= 18)->count(),
            '19-59 years' => $residents->filter(fn ($r) => $age($r) !== null && $age($r) > 18 && $age($r) < 60)->count(),
            '60+ years' => $residents->filter(fn ($r) => $age($r) !== null && $age($r) >= 60)->count(),
        ];
    }

    private function getGenderDistribution()
    {
        return [
            'Male' => Resident::bonafide()->where('is_active', true)->where('gender', 'Male')->count(),
            'Female' => Resident::bonafide()->where('is_active', true)->where('gender', 'Female')->count(),
            'Other' => Resident::bonafide()->where('is_active', true)->where('gender', 'Other')->count(),
        ];
    }
}
