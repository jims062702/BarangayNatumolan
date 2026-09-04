<?php

namespace App\Http\Controllers\Api;

use App\Support\SequenceNumber;

use App\Models\Appointment;
use Illuminate\Http\Request;

class AppointmentController extends BaseController
{
    public function index(Request $request)
    {
        $query = Appointment::with(['resident', 'serviceRequest']);
        
        if ($request->has('office')) {
            $query->where('office', $request->office);
        }
        
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        
        if ($request->has('date')) {
            $query->whereDate('scheduled_datetime', $request->date);
        }
        
        $appointments = $query->orderBy('scheduled_datetime', 'asc')->paginate(20);
        return $this->success($appointments, 'Appointments retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'service_request_id' => 'nullable|exists:service_requests,id',
            'resident_id' => 'required|exists:residents,id',
            'office' => 'required|string',
            'scheduled_datetime' => 'required|date_format:Y-m-d H:i:s',
            'notes' => 'nullable|string',
        ]);

        // Manila wall-clock time — validate "future" in that zone (UTC is +8h off).
        if (\Illuminate\Support\Carbon::parse($validated['scheduled_datetime'], 'Asia/Manila')->isPast()) {
            return $this->error('Please choose a date and time in the future.', 422);
        }

        $validated['appointment_number'] = $this->generateAppointmentNumber();
        $validated['status'] = 'Scheduled';
        
        $appointment = Appointment::create($validated);
        
        return $this->success($appointment, 'Appointment created', 201);
    }

    public function show(Appointment $appointment)
    {
        $appointment->load(['resident', 'serviceRequest']);
        return $this->success($appointment, 'Appointment retrieved');
    }

    public function confirm(Request $request, Appointment $appointment)
    {
        // Resident-booked appointments arrive as "Pending"; staff-created ones
        // as "Scheduled". Either can be confirmed.
        if (!in_array($appointment->status, ['Pending', 'Scheduled'], true)) {
            return $this->error('Only pending or scheduled appointments can be confirmed', 400);
        }

        $appointment->update(['status' => 'Confirmed']);

        return $this->success($appointment, 'Appointment confirmed');
    }

    public function cancel(Request $request, Appointment $appointment)
    {
        $validated = $request->validate([
            'cancellation_reason' => 'required|string',
        ]);
        
        $appointment->update([
            'status' => 'Cancelled',
            'cancelled_at' => now(),
            'cancellation_reason' => $validated['cancellation_reason'],
        ]);
        
        return $this->success($appointment, 'Appointment cancelled');
    }

    public function update(Request $request, Appointment $appointment)
    {
        $validated = $request->validate([
            'scheduled_datetime' => 'date_format:Y-m-d H:i:s|after:' . self::manilaNow(),
            'notes' => 'nullable|string',
        ]);
        
        $appointment->update($validated);
        
        return $this->success($appointment, 'Appointment updated');
    }

    public function destroy(Appointment $appointment)
    {
        if ($appointment->status === 'Completed') {
            return $this->error('Completed appointments cannot be deleted', 400);
        }
        
        $appointment->delete();
        return $this->success(null, 'Appointment deleted');
    }

    /**
     * APT-2026-00001.
     *
     * The prefix was APPT- here and APT- on the portal, so the same table
     * carried two formats depending on which door the appointment came
     * through — and neither series could see the other's numbers. APT- is
     * what the existing rows hold, so APT- is what both doors issue.
     */
    private function generateAppointmentNumber(): string
    {
        return SequenceNumber::next('appointments', 'appointment_number', 'APT-' . date('Y') . '-', 5);
    }
}
