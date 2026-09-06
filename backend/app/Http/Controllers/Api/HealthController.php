<?php

namespace App\Http\Controllers\Api;

use App\Models\ChildHealth;
use App\Models\HealthVisit;
use App\Models\ImmunizationRecord;
use App\Models\MaternalHealth;
use App\Models\Resident;
use Illuminate\Http\Request;

class HealthController extends BaseController
{
    public function listVisits(Request $request)
    {
        $query = HealthVisit::with(['patient:id,resident_number,first_name,last_name', 'provider:id,name']);

        if ($request->filled('date')) {
            $query->whereDate('visit_date', $request->date);
        }
        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        return $this->success($query->orderByDesc('visit_date')->paginate(20), 'Health visits retrieved');
    }

    public function createVisit(Request $request)
    {
        $validated = $request->validate([
            'patient_id' => 'required|exists:residents,id',
            'visit_date' => 'required|date',
            'visit_reason' => 'required|string',
            'temperature' => 'nullable|numeric',
            'blood_pressure' => 'nullable|string',
            'heart_rate' => 'nullable|integer',
            'symptoms' => 'nullable|string',
            'observations' => 'nullable|string',
            'consultation_notes' => 'nullable|string',
            'treatment_advice' => 'nullable|string',
            'followup_schedule' => 'nullable|date',
            'referral_recommended' => 'boolean',
            'referral_destination' => 'nullable|string',
        ]);

        $validated['service_provider_id'] = auth()->id();

        $visit = HealthVisit::create($validated);

        return $this->success($visit, 'Health visit recorded', 201);
    }

    public function getPatientHistory(Resident $resident)
    {
        return $this->success([
            'resident_id' => $resident->id,
            'resident_name' => $resident->full_name,
            'visits' => HealthVisit::where('patient_id', $resident->id)
                ->orderBy('visit_date', 'desc')
                ->limit(10)
                ->get(),
            'immunizations' => ImmunizationRecord::where('child_id', $resident->id)
                ->orderBy('vaccination_date', 'desc')
                ->limit(10)
                ->get(),
            'maternal_health' => MaternalHealth::where('mother_id', $resident->id)->first(),
            'child_health' => ChildHealth::where('child_id', $resident->id)->first(),
        ], 'Patient history retrieved');
    }

    public function listImmunizations(Request $request)
    {
        $query = ImmunizationRecord::with(['child:id,resident_number,first_name,last_name,birthdate']);

        // Counted before the status filter narrows it — see statusCounts.
        $counts = $this->statusCounts($query);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return $this->success(
            $query->orderByDesc('vaccination_date')->paginate(20)->toArray()
                + ['counts' => $counts],
            'Immunization records retrieved'
        );
    }

    public function recordImmunization(Request $request)
    {
        $validated = $request->validate([
            'child_id' => 'required|exists:residents,id',
            'vaccine_name' => 'required|string',
            'vaccination_date' => 'required|date',
            'scheduled_date' => 'nullable|date',
            'lot_number' => 'nullable|string',
            'status' => 'required|in:Completed,Pending,Missed,Rescheduled',
            'notes' => 'nullable|string',
        ]);

        $validated['administered_by'] = auth()->id();

        $record = ImmunizationRecord::create($validated);

        return $this->success($record, 'Immunization recorded', 201);
    }

    public function listMaternal(Request $request)
    {
        $query = MaternalHealth::with('mother:id,resident_number,first_name,last_name,birthdate');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return $this->success(
            $query->orderByDesc('pregnancy_registration_date')->paginate(20),
            'Maternal health records retrieved'
        );
    }

    public function recordMaternalHealth(Request $request)
    {
        $validated = $request->validate([
            'mother_id' => 'required|exists:residents,id',
            'pregnancy_registration_date' => 'required|date',
            'expected_delivery_date' => 'nullable|date|after:pregnancy_registration_date',
            'actual_delivery_date' => 'nullable|date',
            'prenatal_visits_count' => 'integer|min:0',
            'risk_indicators' => 'nullable|string',
            'post_natal_followup_required' => 'boolean',
            'family_planning_method' => 'nullable|string',
            'family_planning_counseling_notes' => 'nullable|string',
            'maternal_immunization_received' => 'boolean',
            'referral_to_hospital' => 'boolean',
            'referral_reason' => 'nullable|string',
            'status' => 'in:Active,Delivered,Closed',
        ]);

        $maternal = MaternalHealth::updateOrCreate(
            ['mother_id' => $validated['mother_id']],
            $validated
        );

        return $this->success($maternal, 'Maternal health recorded', 201);
    }

    public function listChildHealth(Request $request)
    {
        $query = ChildHealth::with('child:id,resident_number,first_name,last_name,birthdate');

        if ($request->filled('nutritional_status')) {
            $query->where('nutritional_status', $request->nutritional_status);
        }

        return $this->success($query->latest()->paginate(20), 'Child health records retrieved');
    }

    public function recordChildHealth(Request $request)
    {
        $validated = $request->validate([
            'child_id' => 'required|exists:residents,id',
            'birth_date' => 'required|date',
            'birth_weight' => 'nullable|numeric',
            'current_weight' => 'nullable|numeric',
            'current_height' => 'nullable|numeric',
            'nutritional_status' => 'nullable|string',
            'growth_monitoring_notes' => 'nullable|string',
            'vitamin_services_received' => 'boolean',
            'breastfeeding_status' => 'nullable|string',
            'feeding_counseling_notes' => 'nullable|string',
            'referral_needed' => 'boolean',
            'referral_destination' => 'nullable|string',
        ]);

        $childHealth = ChildHealth::updateOrCreate(
            ['child_id' => $validated['child_id']],
            $validated
        );

        return $this->success($childHealth, 'Child health recorded', 201);
    }

    public function getImmunizationStatus(Resident $resident)
    {
        $immunizations = ImmunizationRecord::where('child_id', $resident->id)->get();

        $completed = $immunizations->where('status', 'Completed')->count();
        $pending = $immunizations->where('status', 'Pending')->count();
        $missed = $immunizations->where('status', 'Missed')->count();

        return $this->success([
            'child_id' => $resident->id,
            'child_name' => $resident->full_name,
            'total_vaccines' => $immunizations->count(),
            'completed' => $completed,
            'pending' => $pending,
            'missed' => $missed,
            'immunization_status' => $pending === 0 && $missed === 0 && $completed > 0
                ? 'Fully Immunized'
                : 'Incomplete',
            'records' => $immunizations,
        ], 'Immunization status retrieved');
    }

    public function getCoverageReport(Request $request)
    {
        $year = $request->input('year', date('Y'));

        /*
         * The denominator of every coverage figure below. Counting
         * relatives who live in other towns understates immunisation and
         * prenatal coverage against a population the station never serves.
         */
        $residents = Resident::bonafide()->where('is_active', true)->count();
        $healthVisits = HealthVisit::whereYear('visit_date', $year)->count();
        $immunized = ImmunizationRecord::whereYear('vaccination_date', $year)
            ->where('status', 'Completed')
            ->distinct('child_id')
            ->count('child_id');
        $prenatalCare = MaternalHealth::whereYear('pregnancy_registration_date', $year)->count();

        return $this->success([
            'year' => $year,
            'total_population' => $residents,
            'health_visit_coverage' => $residents > 0 ? round(($healthVisits / $residents) * 100, 2) : 0,
            'immunization_coverage' => $residents > 0 ? round(($immunized / $residents) * 100, 2) : 0,
            'prenatal_care_coverage' => $residents > 0 ? round(($prenatalCare / $residents) * 100, 2) : 0,
            'total_visits' => $healthVisits,
            'total_immunized' => $immunized,
            'total_prenatal' => $prenatalCare,
        ], 'Health coverage report retrieved');
    }
}
