<?php

namespace App\Http\Controllers\Api;

use App\Models\Household;
use App\Models\PopulationEvent;
use App\Models\Resident;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class PopulationController extends BaseController
{
    public function listHouseholds(Request $request)
    {
        $query = Household::with(['residents:id,household_id,first_name,last_name', 'head:id,first_name,last_name']);

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

        return $this->success($query->paginate(20), 'Households retrieved');
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

        $household = Household::create($validated);

        // The owner/head becomes a member of this household.
        if (!empty($validated['household_head_id'])) {
            Resident::where('id', $validated['household_head_id'])
                ->update(['household_id' => $household->id]);
        }

        $household->load('head:id,first_name,last_name');

        return $this->success($household, 'Household created', 201);
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
     * Limited resident verification lookup for other offices (Main Office
     * certificate flow) — returns only the minimum necessary fields.
     */
    public function verifyResident(Request $request)
    {
        $validated = $request->validate([
            'q' => 'required|string|min:2',
        ]);

        $residents = Resident::where(function ($query) use ($validated) {
                $q = $validated['q'];
                $query->where('resident_number', 'like', "%{$q}%")
                    ->orWhere('first_name', 'like', "%{$q}%")
                    ->orWhere('last_name', 'like', "%{$q}%");
            })
            ->limit(10)
            ->get(['id', 'resident_number', 'first_name', 'last_name', 'zone_purok', 'residency_status', 'is_active']);

        return $this->success($residents, 'Verification lookup results');
    }

    public function getSectorList(Request $request, $sector)
    {
        $residents = Resident::whereHas('sectors', function ($q) use ($sector) {
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
        $totalPopulation = Resident::where('is_active', true)->count();
        $households = Household::count();

        return $this->success([
            'total_population' => $totalPopulation,
            'total_households' => $households,
            'average_household_size' => $households > 0 ? round($totalPopulation / $households, 2) : 0,
            'population_by_age_group' => $this->getAgeGroupDistribution(),
            'population_by_gender' => $this->getGenderDistribution(),
            'population_by_zone' => Resident::where('is_active', true)
                ->groupBy('zone_purok')
                ->selectRaw('zone_purok, count(*) as count')
                ->orderBy('zone_purok')
                ->get(),
            'events_this_year' => PopulationEvent::whereYear('event_date', date('Y'))
                ->groupBy('event_type')
                ->selectRaw('event_type, count(*) as count')
                ->get(),
            'portal_accounts' => User::where('role', 'Resident')->count(),
        ], 'Population analytics retrieved');
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

    public function createResidentAccount(Request $request, Resident $resident)
    {
        if (!$resident->is_active) {
            return $this->error('Cannot create an account for an inactive resident record', 422);
        }

        if (User::where('resident_id', $resident->id)->exists()) {
            return $this->error('This resident already has a portal account', 409);
        }

        $validated = $request->validate([
            'email' => 'required|email|unique:users,email',
            'password' => 'required|min:6',
        ]);

        $user = User::create([
            'name' => $resident->full_name,
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => 'Resident',
            'office' => 'Resident',
            'is_active' => true,
            'resident_id' => $resident->id,
            'created_by' => auth()->id(),
        ]);

        // If the resident record had no email on file, save the one used for
        // the account so it stays in sync.
        if (empty($resident->email)) {
            $resident->update(['email' => $validated['email']]);
        }

        return $this->success($user, 'Resident portal account created', 201);
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
            ->where('role', 'Resident');

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

        return $this->success($user, $user->is_active ? 'Account activated' : 'Account deactivated');
    }

    private function getAgeGroupDistribution()
    {
        $residents = Resident::where('is_active', true)->get(['birthdate']);

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
            'Male' => Resident::where('is_active', true)->where('gender', 'Male')->count(),
            'Female' => Resident::where('is_active', true)->where('gender', 'Female')->count(),
            'Other' => Resident::where('is_active', true)->where('gender', 'Other')->count(),
        ];
    }
}
