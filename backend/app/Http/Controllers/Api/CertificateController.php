<?php

namespace App\Http\Controllers\Api;

use App\Models\CertificateClearance;
use App\Models\Notification;
use App\Models\Resident;
use App\Models\ServiceRequest;
use App\Support\SequenceNumber;
use Illuminate\Http\Request;

/**
 * Certificates & clearances.
 *
 * There is no approval step and no signature step. The resident asks, the
 * CLERK does the work, and the Punong Barangay signs the paper — which is a
 * thing that happens at a desk, not a button anyone has to click. The
 * register follows the document in three presses:
 *
 *   Pending → Processing → Ready to Claim → Released
 *
 * The resident is told twice, which is what they actually wait for: when the
 * certificate is ready to claim, and when they have received it.
 */
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
        $query = CertificateClearance::with(['resident', 'processor', 'signer', 'releaser']);

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
            // Which documentary requirements the applicant presented.
            'requirements_checklist' => 'nullable|array',
            'requirements_checklist.*.item' => 'required|string',
            'requirements_checklist.*.presented' => 'required|boolean',
            'fee_amount' => 'nullable|numeric|min:0',
            'is_exempt' => 'boolean',
            'exemption_reason' => 'nullable|string',
        ]);

        /*
         * A barangay certificate says something about a CONSTITUENT — that
         * they live here, that they are indigent here, that they are of good
         * moral character here. A non-resident is on the register only so a
         * family could be recorded whole: somebody's mother in Riyadh, a
         * father in Cebu. The barangay has no standing to certify anything
         * about them, and a certificate issued to one is a false document
         * with a real reference number on it.
         *
         * Refused here rather than only hidden in the picker, because the
         * picker is one of several ways a resident id reaches this endpoint.
         */
        $applicant = Resident::findOrFail($validated['resident_id']);

        if ($applicant->isNonResident()) {
            return $this->error(
                $applicant->full_name . ' is recorded as living OUTSIDE Barangay Natumolan, so no '
                    . 'barangay certificate can be issued to them. They are on the register as a '
                    . 'relative of a resident, not as a constituent. If they have moved in, the '
                    . 'Population Office must convert their record first.',
                422
            );
        }

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
            /*
             * One request, one certificate.
             *
             * A request filed from the portal already has its certificate
             * raised against it. Attaching a second leaves two documents on
             * one request, and everything that reads the pair back — the
             * resident's own list included — takes whichever the hasOne
             * happens to return. The resident then watches a status that
             * belongs to a document nobody is working on.
             */
            $already = CertificateClearance::where('service_request_id', $validated['service_request_id'])
                ->whereNotIn('status', ['Cancelled'])
                ->first();

            if ($already) {
                return $this->error(
                    $already->certificate_number . ' has already been raised for this request ('
                        . $already->status . '). Open that one instead of starting another.',
                    409,
                    ['certificate_id' => $already->id]
                );
            }

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

        /*
         * A certificate filed HERE is filed by a clerk who has the applicant
         * in front of them, so it starts on their desk rather than in the
         * pending queue. Only the resident's own online request produces a
         * Pending certificate (see PortalController::createRequest).
         */
        $validated['status'] = 'Processing';
        $validated['processed_by'] = auth()->id();
        $validated['processed_at'] = now();

        $certificate = CertificateClearance::create($validated);
        $certificate->load('resident:id,first_name,last_name');

        Notification::notifyResident(
            $certificate->resident_id,
            'certificate_processing',
            'Certificate being prepared — ' . $certificate->certificate_number,
            'Your ' . $certificate->certificate_type . ' is being prepared. We will let you know as soon as it is ready to claim.',
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Certificate filed and now being processed', 201);
    }

    /** Standard fee for a certificate type (used by the frontend to prefill). */
    public function feeSchedule()
    {
        return $this->success(self::FEES, 'Certificate fee schedule');
    }

    /**
     * Documentary requirements per certificate type, read from the service
     * guide knowledge base so the barangay can change what it asks for
     * without a code change. Returns [] when no guide is published.
     */
    public function requirements(Request $request)
    {
        $type = $request->input('certificate_type');

        $guide = \App\Models\ServiceGuide::where('is_active', true)
            ->where(function ($q) use ($type) {
                // Guides are named for the service; certificate types are the
                // shortened labels, so match either direction.
                $q->where('service_name', $type)
                    ->orWhere('service_name', 'like', $type . '%');
            })
            ->first();

        $items = collect(explode(',', (string) $guide?->requirements))
            ->map(fn ($item) => trim($item))
            ->filter()
            // Present them capitalised — guides are written in running prose.
            ->map(fn ($item) => ucfirst($item))
            ->values();

        return $this->success([
            'certificate_type' => $type,
            'requirements' => $items,
            'source_guide' => $guide?->service_name,
        ], 'Documentary requirements retrieved');
    }

    public function show(CertificateClearance $certificate)
    {
        $certificate->load(['resident', 'serviceRequest', 'processor', 'signer', 'releaser']);

        return $this->success($certificate, 'Certificate retrieved');
    }

    /**
     * Corrects the certificate type or purpose — a misspelling caught before
     * the document is printed.
     *
     * Only possible before printing: once a certificate has been printed the
     * physical document exists, and altering the record behind it would leave
     * the paper and the register disagreeing.
     */
    public function update(Request $request, CertificateClearance $certificate)
    {
        if ($certificate->status === CertificateClearance::CANCELLED) {
            return $this->error('A cancelled application cannot be edited. File a new one.', 409);
        }

        if (!$certificate->isBeforePrinting()) {
            return $this->error(
                'This certificate has already been printed, so its details can no longer be edited. File a new application with the corrected wording.',
                409
            );
        }

        $validated = $request->validate([
            'certificate_type' => 'sometimes|in:' . implode(',', array_keys(self::FEES)),
            'purpose' => 'sometimes|string|max:255',
        ]);

        $typeChanged = isset($validated['certificate_type'])
            && $validated['certificate_type'] !== $certificate->certificate_type;

        // The fee follows the type, unless the applicant is fee-exempt.
        if ($typeChanged && !$certificate->is_exempt) {
            $validated['fee_amount'] = self::FEES[$validated['certificate_type']] ?? 0;
        }

        $certificate->update($validated);
        $certificate->load('resident:id,first_name,last_name');

        return $this->success($certificate, 'Certificate updated');
    }

    /**
     * The clerk takes an online request off the queue and starts work on it.
     * This is the only thing that has to happen for a resident's request to
     * start moving — there is no approval waiting behind it.
     */
    public function accept(Request $request, CertificateClearance $certificate)
    {
        if ($certificate->status !== 'Pending') {
            return $this->error('Only pending requests can be started', 400);
        }

        $certificate->update([
            'status' => 'Processing',
            'processed_by' => auth()->id(),
            'processed_at' => now(),
        ]);

        // The linked request follows the counter.
        ServiceRequest::where('id', $certificate->service_request_id)
            ->update(['status' => 'In Progress', 'assigned_to' => auth()->id()]);

        Notification::notifyResident(
            $certificate->resident_id,
            'certificate_processing',
            'Certificate request started — ' . $certificate->certificate_number,
            'A barangay clerk has started preparing your ' . $certificate->certificate_type
                . '. We will notify you once it is ready to claim.',
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Request accepted — now being processed');
    }

    /**
     * The clerk prints the certificate — and that is the whole middle of the
     * workflow.
     *
     * Printing used to be three presses (mark printed, send for signature,
     * mark signed) recording a journey that happens on paper anyway, on a
     * counter one clerk runs alone. It is one press now: the document exists,
     * it goes to the Punong Barangay for signing on its way to the counter,
     * and the resident is told it is ready to claim.
     *
     * The wording is frozen from here on, because the paper now exists.
     */
    public function markPrinted(Request $request, CertificateClearance $certificate)
    {
        if ($certificate->status !== 'Processing') {
            return $this->error('Only certificates being processed can be printed', 400);
        }

        $certificate->update([
            'status' => 'Ready to Claim',
            'printed_at' => now(),
            'ready_at' => now(),
            // Issued the moment the document is real, so public verification
            // works from the second the resident is told about it.
            'qr_code' => $this->generateQRCode($certificate->reference_number),
        ]);

        /*
         * The request follows the counter here too.
         *
         * 'Approved' is what the service_requests enum has for "done, not yet
         * handed over"; the words the resident reads come from the
         * certificate itself, which is the only record that knows the paper
         * exists. Leaving this at 'In Progress' is what made the portal
         * disagree with the clerk.
         */
        ServiceRequest::where('id', $certificate->service_request_id)
            ->update(['status' => 'Approved']);

        Notification::notifyResident(
            $certificate->resident_id,
            'certificate_ready',
            'Ready to claim — ' . $certificate->certificate_number,
            'Your ' . $certificate->certificate_type . ' is ready to claim '
                . 'at the Barangay Main Office (Mon-Fri, 8:00 AM-5:00 PM). '
                . 'Verification reference: ' . $certificate->reference_number,
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Printed — the resident has been notified it is ready to claim');
    }

    /** The resident collects the document. */
    public function release(Request $request, CertificateClearance $certificate)
    {
        if ($certificate->status !== 'Ready to Claim') {
            return $this->error('Print the certificate first — only one that is ready to claim can be released', 400);
        }

        $certificate->update([
            'status' => 'Released',
            'released_by' => auth()->id(),
            'released_at' => now(),
            'claimed_at' => now(),
            'qr_code' => $certificate->qr_code ?: $this->generateQRCode($certificate->reference_number),
        ]);

        // Handing over the certificate completes the request.
        ServiceRequest::where('id', $certificate->service_request_id)
            ->update(['status' => 'Completed', 'completed_at' => now()]);

        Notification::notifyResident(
            $certificate->resident_id,
            'certificate_released',
            'Certificate received — ' . $certificate->certificate_number,
            'You have received your ' . $certificate->certificate_type . '. '
                . 'Verification reference: ' . $certificate->reference_number,
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Certificate released to the resident');
    }

    /**
     * The one exit off the workflow: an application that should never have
     * been filed (withdrawn, duplicate, wrong person). This is NOT a
     * rejection — nobody judges the request — so it is only available before
     * the document is printed, and the reason is written for the resident.
     */
    public function cancel(Request $request, CertificateClearance $certificate)
    {
        if (!$certificate->isBeforePrinting()) {
            return $this->error(
                'This certificate has already been printed and can no longer be cancelled.',
                409
            );
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $certificate->update([
            'status' => CertificateClearance::CANCELLED,
            'cancel_reason' => $validated['reason'],
        ]);

        ServiceRequest::where('id', $certificate->service_request_id)
            ->update(['status' => 'Rejected']);

        Notification::notifyResident(
            $certificate->resident_id,
            'certificate_cancelled',
            'Certificate request cancelled — ' . $certificate->certificate_number,
            'Your ' . $certificate->certificate_type . ' request was cancelled. Reason: '
                . $validated['reason'] . ' You may visit the Barangay Main Office for assistance.',
            'certificate',
            $certificate->id
        );

        return $this->success($certificate, 'Certificate request cancelled');
    }

    public function reprint(Request $request, CertificateClearance $certificate)
    {
        if (!in_array($certificate->status, ['Ready to Claim', 'Released'], true)) {
            return $this->error('Only signed certificates can be reprinted', 400);
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
        return SequenceNumber::next('service_requests', 'request_number', 'REQ-' . $year . '-', 6);
    }

    private function generateQRCode($data): string
    {
        // Placeholder: integrate with QR code library
        return 'qr_' . hash('md5', $data);
    }
}
