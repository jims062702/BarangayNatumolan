<?php

namespace App\Http\Controllers\Api;

use App\Models\CertificateClearance;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;

class ServiceRequestController extends BaseController
{
    /**
     * Service types that produce a certificate, mapped to the certificate
     * type. Non-certificate services (blotter, complaints, …) are not here.
     */
    private const CERTIFICATE_TYPES = [
        'Barangay Clearance' => 'Barangay Clearance',
        'Barangay Certificate' => 'Other',
        'Certificate of Residency' => 'Certificate of Residency',
        'Certificate of Indigency' => 'Certificate of Indigency',
        'First-Time Jobseeker Certification' => 'First-Time Jobseeker',
        'Certificate of Low or No Income' => 'Certificate of Low or No Income',
        'Business Barangay Clearance' => 'Business Barangay Clearance',
        'Good Moral Character' => 'Good Moral Character',
        'Other Barangay Service' => 'Other',
    ];

    public function index(Request $request)
    {
        $query = ServiceRequest::with(['resident', 'assignedUser', 'appointments']);
        
        if ($request->has('office')) {
            $query->where('office', $request->office);
        }
        
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        
        if ($request->has('request_type')) {
            $query->where('request_type', $request->request_type);
        }

        if ($request->filled('resident_id')) {
            $query->where('resident_id', $request->resident_id);
        }

        $requests = $query->orderBy('created_at', 'desc')->paginate(20);
        return $this->success($requests, 'Service requests retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'resident_id' => 'nullable|exists:residents,id',
            'service_type' => 'required|string',
            'office' => 'required|string',
            'request_type' => 'required|in:Walk-in,Online',
            'purpose' => 'nullable|string',
        ]);

        $validated['request_number'] = $this->generateRequestNumber();

        // Walk-ins are being served at the desk right now → In Progress,
        // assigned to the staff member recording them. Online requests
        // arrive Pending until the clerk starts processing them.
        if ($validated['request_type'] === 'Walk-in') {
            $validated['status'] = 'In Progress';
            $validated['assigned_to'] = auth()->id();
        } else {
            $validated['status'] = 'Pending';
        }

        $serviceRequest = ServiceRequest::create($validated);

        // A walk-in cert-type request is already "In Progress" — file its
        // certificate right away so it shows in Certificates & Clearances,
        // exactly like an online request when the clerk starts processing.
        if ($serviceRequest->status === 'In Progress') {
            $this->fileCertificateApplication($serviceRequest);
        }
        $serviceRequest->load('certificate');

        return $this->success($serviceRequest, 'Service request created', 201);
    }

    public function show(ServiceRequest $serviceRequest)
    {
        $serviceRequest->load(['resident', 'appointments', 'certificate', 'referrals']);
        return $this->success($serviceRequest, 'Service request retrieved');
    }

    public function update(Request $request, ServiceRequest $serviceRequest)
    {
        // "Approved" is intentionally not settable here — it is applied
        // automatically when the Punong Barangay approves the linked
        // certificate (see CertificateController::approve/reject).
        $validated = $request->validate([
            'status' => 'in:Pending,In Progress,Completed,Rejected',
            'purpose' => 'nullable|string',
            'assigned_to' => 'nullable|exists:users,id',
        ]);

        $statusChanged = isset($validated['status']) && $validated['status'] !== $serviceRequest->status;

        if (($validated['status'] ?? null) === 'Completed' && !$serviceRequest->completed_at) {
            $validated['completed_at'] = now();
        }

        $serviceRequest->update($validated);

        // Starting to process a certificate-type request files the
        // certificate application automatically — it appears in
        // Certificates & Clearances awaiting the PB's decision, with no
        // separate "+ New certificate" step for the clerk.
        if ($statusChanged && $serviceRequest->status === 'In Progress') {
            $this->fileCertificateApplication($serviceRequest);
        }

        if ($statusChanged) {
            \App\Models\Notification::notifyResident(
                $serviceRequest->resident_id,
                'request_status',
                'Request ' . $serviceRequest->request_number . ' is now ' . $serviceRequest->status,
                'Your ' . $serviceRequest->service_type . ' request status changed to "' . $serviceRequest->status . '".',
                'service_request',
                $serviceRequest->id
            );
        }

        // `certificate` lets the frontend confirm the auto-filed application.
        $serviceRequest->load('certificate');

        return $this->success($serviceRequest, 'Service request updated');
    }

    public function destroy(ServiceRequest $serviceRequest)
    {
        $serviceRequest->delete();
        return $this->success(null, 'Service request deleted');
    }

    public function getStatus(ServiceRequest $serviceRequest)
    {
        return $this->success([
            'request_number' => $serviceRequest->request_number,
            'status' => $serviceRequest->status,
            'office' => $serviceRequest->office,
            'service_type' => $serviceRequest->service_type,
            'created_at' => $serviceRequest->created_at,
            'completed_at' => $serviceRequest->completed_at,
        ], 'Request status retrieved');
    }

    public function getAvailableServices()
    {
        return $this->success([
            'Main Office' => [
                'Barangay Clearance',
                'Certificate of Residency',
                'Certificate of Indigency',
                'First-Time Jobseeker Certification',
                'Certificate of Low or No Income',
                'Business Barangay Clearance',
            ],
            'VAWC Office' => [
                'Complaint Intake',
                'Case Assistance',
                'Referral Services',
            ],
            'Lupon' => [
                'Case Filing',
                'Mediation Services',
                'Conciliation',
            ],
            'Health Station' => [
                'Medical Consultation',
                'Immunization',
                'Prenatal Care',
                'Child Health Checkup',
            ],
        ], 'Available services');
    }

    public function getContactInfo()
    {
        return $this->success([
            'barangay_name' => 'Barangay Natumolan',
            'municipality' => 'Tagoloan',
            'province' => 'Misamis Oriental',
            'phone' => '(XXX) XXX-XXXX',
            'email' => 'barangay@tagoloan.gov.ph',
            'office_hours' => '8:00 AM - 5:00 PM, Monday to Friday',
        ], 'Contact information');
    }

    private function generateRequestNumber(): string
    {
        $year = date('Y');
        $count = ServiceRequest::whereYear('created_at', $year)->count() + 1;
        return 'REQ-' . $year . '-' . str_pad($count, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Files the certificate application for a certificate-type request.
     * Skipped for non-certificate services, unlinked requests, and requests
     * that already have a certificate.
     */
    private function fileCertificateApplication(ServiceRequest $serviceRequest): void
    {
        $type = self::CERTIFICATE_TYPES[$serviceRequest->service_type] ?? null;

        if (!$type || !$serviceRequest->resident_id || $serviceRequest->certificate()->exists()) {
            return;
        }

        $certificate = CertificateClearance::create([
            'certificate_number' => CertificateClearance::nextCertificateNumber(),
            'reference_number' => CertificateClearance::nextReferenceNumber(),
            'resident_id' => $serviceRequest->resident_id,
            'service_request_id' => $serviceRequest->id,
            'certificate_type' => $type,
            'purpose' => $serviceRequest->purpose ?: $type,
            'fee_amount' => CertificateController::FEES[$type] ?? 0,
            'is_exempt' => false,
            'status' => 'Application',
        ]);

        // Ping the Punong Barangay — a certificate is waiting for a decision.
        \App\Models\Notification::notifyPunongBarangay(
            'certificate_pending',
            'Certificate awaiting your approval',
            ($serviceRequest->resident?->full_name ?? 'A resident') . ' — '
                . $type . ' (' . $certificate->certificate_number . ')',
            'certificate',
            $certificate->id
        );
    }
}
