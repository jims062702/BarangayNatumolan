<?php

namespace App\Http\Controllers\Api;

use App\Support\SequenceNumber;

use App\Models\CertificateClearance;
use App\Models\Resident;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;

class ServiceRequestController extends BaseController
{
    /**
     * Service types that produce a certificate, mapped to the certificate
     * type. Non-certificate services (blotter, complaints, …) are not here.
     */
    public const CERTIFICATE_TYPES = [
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

    /** The only service a non-resident may ask the barangay for. */
    public const COMPLAINT = 'Complaint';

    public function store(Request $request)
    {
        $validated = $request->validate([
            'resident_id' => 'nullable|exists:residents,id',
            'service_type' => 'required|string',
            'office' => 'required|string',
            'request_type' => 'required|in:Walk-in,Online',
            'purpose' => 'nullable|string',
        ]);

        /*
         * The one thing somebody who does not live here may still do.
         *
         * A non-resident cannot be issued anything by this barangay — but a
         * person wronged by a resident has to be able to say so, whoever they
         * are and wherever they live. Refusing a complaint because the
         * complainant lives in the next town would close the only door the
         * Katarungang Pambarangay leaves open to them.
         *
         * So: complaints yes, everything else no.
         */
        if (!empty($validated['resident_id'])) {
            $applicant = Resident::find($validated['resident_id']);

            if ($applicant?->isNonResident() && $validated['service_type'] !== self::COMPLAINT) {
                return $this->error(
                    $applicant->full_name . ' lives outside Barangay Natumolan and is on the '
                        . 'register only as a relative of a resident. The barangay cannot issue '
                        . 'them a certificate or clearance. A complaint against a resident is the '
                        . 'one request they may file.',
                    422
                );
            }
        }

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
        // "Approved" is intentionally not settable here. Certificates are
        // no longer approved by anyone: the request simply follows the
        // clerk's work on the document (see CertificateController).
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

        // Starting to process a certificate-type request puts the
        // certificate on the clerk's desk automatically — it appears in
        // Certificates & Clearances already being processed, with no
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

    /**
     * REQ-2026-000001.
     *
     * Six digits, because that is what the register already holds. This door
     * padded to five and the portal's to six, which is how one series ended
     * up with REQ-2026-00038 sitting among REQ-2026-000050s — and a text
     * comparison then read the shorter one as the highest.
     */
    private function generateRequestNumber(): string
    {
        return SequenceNumber::next('service_requests', 'request_number', 'REQ-' . date('Y') . '-', 6);
    }

    /**
     * Puts a certificate-type request on the clerk's desk. Skipped for
     * non-certificate services and unlinked requests.
     *
     * A resident who asked online already has a Pending certificate waiting
     * (PortalController::createRequest raises it), and moving the request to
     * In Progress IS the clerk accepting it — so that one is advanced rather
     * than duplicated, keeping the request and the document in step.
     */
    private function fileCertificateApplication(ServiceRequest $serviceRequest): void
    {
        $type = self::CERTIFICATE_TYPES[$serviceRequest->service_type] ?? null;

        if (!$type || !$serviceRequest->resident_id) {
            return;
        }

        $existing = $serviceRequest->certificate()->first();

        if ($existing) {
            if ($existing->status === 'Pending') {
                $existing->update([
                    'status' => 'Processing',
                    'processed_by' => auth()->id(),
                    'processed_at' => now(),
                ]);
            }

            return;
        }

        CertificateClearance::create([
            'certificate_number' => CertificateClearance::nextCertificateNumber(),
            'reference_number' => CertificateClearance::nextReferenceNumber(),
            'resident_id' => $serviceRequest->resident_id,
            'service_request_id' => $serviceRequest->id,
            'certificate_type' => $type,
            'purpose' => $serviceRequest->purpose ?: $type,
            'fee_amount' => CertificateController::FEES[$type] ?? 0,
            'is_exempt' => false,
            // The clerk is working on it right now — no queue, no decision.
            'status' => 'Processing',
            'processed_by' => auth()->id(),
            'processed_at' => now(),
        ]);

    }
}
