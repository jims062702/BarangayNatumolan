<?php

namespace App\Http\Controllers\Api;

use App\Models\Resident;
use App\Models\Household;
use App\Support\LandingCache;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ResidentController extends BaseController
{
    /**
     * Display all residents
     */
    public function index(Request $request): JsonResponse
    {
        $query = Resident::with(['household', 'sectors']);

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('resident_number', 'like', "%{$search}%");
            });
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
        
        $residents = $query->paginate(20);
        return $this->success($residents, 'Residents retrieved successfully');
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

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'middle_name' => 'nullable|string|max:100',
            'last_name' => 'required|string|max:100',
            'suffix' => 'nullable|string|max:50',
            'gender' => 'required|in:Male,Female,Other',
            'birthdate' => 'required|date',
            'civil_status' => 'nullable|string',
            'occupation' => 'nullable|string',
            'contact_number' => 'nullable|string',
            'email' => 'nullable|email',
            'household_id' => 'nullable|exists:households,id',
            'zone_purok' => 'required|string',
            'residency_status' => 'required|in:Permanent,Temporary,Migrant',
            'length_of_residence_years' => 'nullable|integer',
            'educational_attainment' => 'nullable|string',
            'demographic_classification' => 'nullable|in:Senior Citizen,PWD,Solo Parent,Youth,Child,Adult,Others',
            // Sector tags chosen on the form (age-based + manual toggles).
            'sectors' => 'nullable|array',
            'sectors.*' => 'string|max:100',
        ]);

        $sectors = collect($validated['sectors'] ?? [])->filter()->unique()->values();
        unset($validated['sectors']);

        // Generate unique resident number
        $validated['resident_number'] = $this->generateResidentNumber();

        $resident = Resident::create($validated);

        foreach ($sectors as $sectorType) {
            $resident->sectors()->create([
                'sector_type' => $sectorType,
                'enrolled_date' => now()->toDateString(),
            ]);
        }

        LandingCache::clearStats(); // refresh the public "at a glance" count
        $resident->load('sectors');

        return $this->success($resident, 'Resident created successfully', 201);
    }

    /**
     * Get single resident
     */
    public function show(Resident $resident): JsonResponse
    {
        $resident->load([
            'household', 'sectors', 'serviceRequests', 'certificates',
            'account:id,email,resident_id,is_active', // null when no portal account yet
        ]);
        return $this->success($resident, 'Resident retrieved successfully');
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
            'occupation' => 'nullable|string',
            'contact_number' => 'nullable|string',
            'email' => 'nullable|email',
            'household_id' => 'nullable|exists:households,id',
            'zone_purok' => 'string',
            'residency_status' => 'in:Permanent,Temporary,Migrant',
            'length_of_residence_years' => 'nullable|integer|min:0',
            'educational_attainment' => 'nullable|string',
            'demographic_classification' => 'nullable|in:Senior Citizen,PWD,Solo Parent,Youth,Child,Adult,Others',
            'remarks' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $resident->update($validated);
        $resident->load(['household', 'sectors']);
        LandingCache::clearStats(); // is_active/purok may have changed the counts

        return $this->success($resident, 'Resident updated successfully');
    }

    /**
     * Delete resident
     */
    public function destroy(Resident $resident): JsonResponse
    {
        if (!$this->canWriteRegistry()) {
            return $this->forbidden('Your office cannot modify the resident registry');
        }

        $resident->delete();
        LandingCache::clearStats();

        return $this->success(null, 'Resident deleted successfully');
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
        $search = $request->input('q');
        $residents = Resident::where('first_name', 'like', "%{$search}%")
            ->orWhere('last_name', 'like', "%{$search}%")
            ->orWhere('resident_number', 'like', "%{$search}%")
            ->limit(10)
            ->get(['id', 'resident_number', 'first_name', 'last_name']);
            
        return $this->success($residents, 'Search results');
    }

    /**
     * Add resident to sector
     */
    public function addSector(Request $request, Resident $resident): JsonResponse
    {
        $validated = $request->validate([
            'sector_type' => 'required|string',
            'enrolled_date' => 'nullable|date',
        ]);

        $resident->sectors()->create($validated);
        
        return $this->success(null, 'Resident added to sector successfully', 201);
    }

    /**
     * Get administrative records
     */
    public function getAdministrativeRecords(Request $request): JsonResponse
    {
        $records = \App\Models\AdministrativeRecord::where('is_archived', false)
            ->orderBy('document_date', 'desc')
            ->paginate(20);
            
        return $this->success($records, 'Administrative records retrieved');
    }

    /**
     * Create administrative record
     */
    public function createAdministrativeRecord(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'document_type' => 'required|string',
            'document_title' => 'required|string',
            'document_number' => 'required|string|unique:administrative_records',
            'document_date' => 'required|date',
            'document_content' => 'required|string',
            'summary' => 'nullable|string',
        ]);

        $validated['created_by'] = auth()->id();
        
        $record = \App\Models\AdministrativeRecord::create($validated);
        
        return $this->success($record, 'Administrative record created successfully', 201);
    }

    /**
     * Generate unique resident number
     */
    private function generateResidentNumber(): string
    {
        $year = date('Y');
        $count = Resident::whereYear('created_at', $year)->count() + 1;
        return $year . '-' . str_pad($count, 6, '0', STR_PAD_LEFT);
    }
}
