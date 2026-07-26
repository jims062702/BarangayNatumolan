<?php

namespace App\Http\Controllers\Api;

use App\Models\Announcement;
use App\Models\Appointment;
use App\Models\CertificateClearance;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;

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
                    ->where('status', 'Approved')->count(),
            ],
            'recent_requests' => ServiceRequest::where('resident_id', $residentId)
                ->latest()->limit(5)->get(),
            'upcoming_appointments' => Appointment::where('resident_id', $residentId)
                ->where('status', '!=', 'Cancelled')
                ->where('scheduled_datetime', '>=', now())
                ->orderBy('scheduled_datetime')->limit(5)->get(),
            'announcements' => Announcement::where('is_published', true)
                ->orderByDesc('published_at')->limit(4)->get(),
        ], 'Portal dashboard retrieved');
    }

    public function myRequests()
    {
        return $this->success(
            ServiceRequest::with(['certificate:id,service_request_id,certificate_type,status,reference_number'])
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
            'office' => 'in:Main Office,Population,Health Station,CDC',
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

        // Ping the front desk so the clerk sees (and hears) the new request.
        $residentName = $serviceRequest->resident?->full_name ?? 'A resident';
        \App\Models\Notification::notifyFrontDesk(
            'new_request',
            'New online request: ' . $serviceRequest->service_type,
            $residentName . ' submitted a ' . $serviceRequest->service_type
                . ' request (' . $serviceRequest->request_number . '). Purpose: ' . $serviceRequest->purpose,
            'service_request',
            $serviceRequest->id
        );

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
            'office' => 'required|in:Main Office,Population,Health Station,CDC,Lupon',
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
            'appointment_number' => 'APT-' . date('Y') . '-' . str_pad(Appointment::count() + 1, 5, '0', STR_PAD_LEFT),
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

        return $this->success($user, 'Profile retrieved');
    }

    private function generateRequestNumber(): string
    {
        $year = date('Y');
        $count = ServiceRequest::whereYear('created_at', $year)->count() + 1;

        return 'REQ-' . $year . '-' . str_pad($count, 6, '0', STR_PAD_LEFT);
    }
}
