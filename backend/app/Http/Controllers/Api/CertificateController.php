<?php

namespace App\Http\Controllers\Api;

use App\Models\CertificateClearance;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;

class CertificateController extends BaseController
{
    /** Standard fee schedule per certificate type (₱). */
    public const FEES = [
        'Barangay Clearance' => 50,
        'Certificate of Residency' => 30,
        'Certificate of Indigency' => 0,
        'First-Time Jobseeker' => 0,
        'Certificate of Low or No Income' => 0,
        'Business Barangay Clearance' => 200,
        'Good Moral Character' => 50,
        'Other' => 0,
    ];

    public function index(Request $request)
    {
        $query = CertificateClearance::with(['resident', 'approver', 'releaser']);
        
        if ($request->has('resident_id')) {
            $query->where('resident_id', $request->resident_id);
        }
        
        if ($request->has('certificate_type')) {
            $query->where('certificate_type', $request->certificate_type);
        }
        
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        
        $certificates = $query->orderBy('created_at', 'desc')->paginate(20);
        return $this->success($certificates, 'Certificates retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'resident_id' => 'required|exists:residents,id',
            // Optional: when omitted this is a walk-in and we create the request.
            'service_request_id' => 'nullable|exists:service_requests,id',
            'certificate_type' => 'required|string',
            'purpose' => 'required|string',
            'fee_amount' => 'nullable|numeric|min:0',
            'is_exempt' => 'boolean',
            'exemption_reason' => 'nullable|string',
        ]);

        // Walk-in: no prior request → create one automatically so the
        // certificate is always tied to a tracked service request.
        if (empty($validated['service_request_id'])) {
            $serviceRequest = ServiceRequest::create([
                'request_number' => $this->generateRequestNumber(),
                'resident_id' => $validated['resident_id'],
                'service_type' => $validated['certificate_type'],
                'office' => 'Main Office',
                'request_type' => 'Walk-in',
                'status' => 'In Progress',
                'purpose' => $validated['purpose'],
                'assigned_to' => auth()->id(),
            ]);
            $validated['service_request_id'] = $serviceRequest->id;
        } else {
            // Filing the certificate means the request is now being
            // processed — move Pending (online) requests to In Progress.
            ServiceRequest::where('id', $validated['service_request_id'])
                ->where('status', 'Pending')
                ->update(['status' => 'In Progress', 'assigned_to' => auth()->id()]);
        }

        // Fee is automatic from the type; exempt = free; explicit amount wins.
        $isExempt = $validated['is_exempt'] ?? false;
        $validated['fee_amount'] = $isExempt
            ? 0
            : ($validated['fee_amount'] ?? (self::FEES[$validated['certificate_type']] ?? 0));

        $validated['certificate_number'] = CertificateClearance::nextCertificateNumber();
        $validated['reference_number'] = CertificateClearance::nextReferenceNumber();
        $validated['status'] = 'Application';

        $certificate = CertificateClearance::create($validated);
        $certificate->load('resident:id,first_name,last_name');

        // Ping the Punong Barangay — a certificate is waiting for a decision.
        \App\Models\Notification::notifyPunongBarangay(
            'certificate_pending',
            'Certificate awaiting your approval',
            ($certificate->resident?->full_name ?? 'A resident') . ' — '
                . $certificate->certificate_type . ' (' . $certificate->certificate_number . ')',
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Certificate created', 201);
    }

    /** Standard fee for a certificate type (used by the frontend to prefill). */
    public function feeSchedule()
    {
        return $this->success(self::FEES, 'Certificate fee schedule');
    }

    public function show(CertificateClearance $certificate)
    {
        $certificate->load(['resident', 'serviceRequest', 'approver', 'releaser']);
        return $this->success($certificate, 'Certificate retrieved');
    }

    public function approve(Request $request, CertificateClearance $certificate)
    {
        // Digital approval is reserved for the Punong Barangay.
        if (auth()->user()->role !== 'Punong Barangay') {
            return $this->forbidden('Only the Punong Barangay can approve certificates');
        }

        if ($certificate->status !== 'Application') {
            return $this->error('Only pending applications can be approved', 400);
        }

        $certificate->update([
            'status' => 'Approved',
            'approved_by' => auth()->id(),
            'approved_at' => now(),
        ]);

        // The linked request follows the PB's decision automatically.
        ServiceRequest::where('id', $certificate->service_request_id)
            ->update(['status' => 'Approved']);

        \App\Models\Notification::notifyResident(
            $certificate->resident_id,
            'certificate_approved',
            'Certificate approved — ' . $certificate->certificate_number,
            'Your ' . $certificate->certificate_type . ' has been approved and will be ready for release.',
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Certificate approved');
    }

    public function reject(Request $request, CertificateClearance $certificate)
    {
        // Rejection, like approval, is the Punong Barangay's decision.
        if (auth()->user()->role !== 'Punong Barangay') {
            return $this->forbidden('Only the Punong Barangay can reject certificates');
        }

        if ($certificate->status !== 'Application') {
            return $this->error('Only pending applications can be rejected', 400);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $certificate->update([
            'status' => 'Rejected',
            'rejection_reason' => $validated['reason'] ?? null,
        ]);

        // The linked request follows the PB's decision automatically.
        ServiceRequest::where('id', $certificate->service_request_id)
            ->update(['status' => 'Rejected']);

        \App\Models\Notification::notifyResident(
            $certificate->resident_id,
            'certificate_rejected',
            'Certificate not approved — ' . $certificate->certificate_number,
            'Your ' . $certificate->certificate_type . ' request was not approved by the Punong Barangay.'
                . (!empty($validated['reason']) ? ' Reason: ' . $validated['reason'] : '')
                . ' You may visit the Main Office for assistance.',
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Certificate rejected');
    }

    /** Marks an approved certificate as printed (after the clerk confirms the
     *  printout came out correctly). Only then can it be released. */
    public function markPrinted(Request $request, CertificateClearance $certificate)
    {
        if ($certificate->status !== 'Approved') {
            return $this->error('Only approved certificates can be marked as printed', 400);
        }

        $certificate->update(['status' => 'Printed']);

        return $this->success($certificate, 'Certificate marked as printed');
    }

    public function release(Request $request, CertificateClearance $certificate)
    {
        // A certificate must be printed successfully before it can be released.
        if ($certificate->status !== 'Printed') {
            return $this->error('Print the certificate first, then release it', 400);
        }

        $certificate->update([
            'status' => 'Released',
            'released_by' => auth()->id(),
            'released_at' => now(),
            'qr_code' => $this->generateQRCode($certificate->reference_number),
        ]);

        // Handing over the certificate completes the request.
        ServiceRequest::where('id', $certificate->service_request_id)
            ->update(['status' => 'Completed', 'completed_at' => now()]);

        \App\Models\Notification::notifyResident(
            $certificate->resident_id,
            'certificate_released',
            'Certificate released — ' . $certificate->certificate_number,
            'Your ' . $certificate->certificate_type . ' has been released. Verification reference: ' . $certificate->reference_number,
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Certificate released');
    }

    public function reprint(Request $request, CertificateClearance $certificate)
    {
        if ($certificate->status !== 'Released') {
            return $this->error('Only released certificates can be reprinted', 400);
        }
        
        $certificate->increment('reprint_count');
        
        return $this->success([
            'certificate_number' => $certificate->certificate_number,
            'reprint_count' => $certificate->reprint_count,
            'reprinted_at' => now(),
        ], 'Certificate reprinted');
    }

    private function generateRequestNumber(): string
    {
        $year = date('Y');
        $count = ServiceRequest::whereYear('created_at', $year)->count() + 1;
        return 'REQ-' . $year . '-' . str_pad($count, 6, '0', STR_PAD_LEFT);
    }

    private function generateQRCode($data): string
    {
        // Placeholder: integrate with QR code library
        return 'qr_' . hash('md5', $data);
    }
}
