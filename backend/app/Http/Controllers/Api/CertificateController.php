<?php

namespace App\Http\Controllers\Api;

use App\Support\DateWindow;
use App\Models\CertificateClearance;
use App\Models\Notification;
use App\Models\Resident;
use App\Models\ServiceRequest;
use App\Support\SequenceNumber;
use App\Support\CertificateCatalogue;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
    /*
     * The schedule moved out, and changed shape on the way.
     *
     * This was eight types with one price each. The ordinance of 18 January
     * 2020 does not work that way: a Barangay Clearance is ₱200 for a
     * Mayor's Permit and ₱30 for local employment, and a business clearance
     * runs ₱25 to ₱750 by the kind of business. A flat number per type could
     * not express that however carefully the numbers were chosen.
     *
     * See App\Support\CertificateCatalogue.
     */

    public function index(Request $request)
    {
        /*
         * The request behind it, for one column only: whether it was asked
         * for at the counter or online. A clerk deciding what to do with a
         * finished certificate needs to know which — somebody who walked in
         * is expecting to be called; somebody who asked online may never
         * open their portal to find out it is ready.
         *
         * Two columns of it, not the whole request: this is a list of
         * twenty, and the rest of the request is a modal away.
         */
        $query = CertificateClearance::with([
            'resident', 'processor', 'signer', 'releaser',
            'serviceRequest:id,request_type',
        ]);

        if ($request->has('resident_id')) {
            $query->where('resident_id', $request->resident_id);
        }

        if ($request->has('certificate_type')) {
            $query->where('certificate_type', $request->certificate_type);
        }

        // Counted before the status filter narrows it — see statusCounts.
        $counts = $this->statusCounts($query);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $certificates = $query->orderBy('created_at', 'desc')->paginate(20);

        return $this->success(
            $certificates->toArray() + ['counts' => $counts],
            'Certificates retrieved'
        );
    }

    /**
     * How many certificates were asked for, over the windows a clerk is asked
     * about.
     *
     * Every window is counted in ONE pass and returned together, because the
     * question is never just "how many today" — it is "how many today, and is
     * that a lot?" Five separate calls would make the comparison the clerk's
     * job.
     *
     * Counted from `created_at`, which is when the certificate was ASKED for.
     * A clerk reporting volume is reporting demand, not output — a request
     * made today and released next week belongs to today.
     *
     * The boundaries are Philippine, not UTC. The server stores UTC, so a
     * request made at eight this morning in Tagoloan is stored as midnight,
     * and "today" counted in UTC would put it on yesterday. Every window here
     * is worked out in Manila time and then converted back.
     */
    public function report(Request $request)
    {
        /*
         * The five windows, defined once for the whole system in DateWindow —
         * including the definition of "mid-year" that used to live here, and
         * which the VAWC and Lupon dockets now read from the same place.
         */
        $windows = collect(DateWindow::PRESETS)
            ->mapWithKeys(fn (string $name) => [$name => DateWindow::preset($name)]);

        $counts = $windows
            ->map(fn (DateWindow $w) => $w->applyTo(CertificateClearance::query(), 'created_at')->count())
            ->all();

        /*
         * The breakdown follows whichever window the clerk picked, so "what
         * are people asking for this month" and "what did they ask for all
         * year" are the same screen.
         */
        /*
         * A preset, or a named month or year — the same question the other
         * dockets take, so last December is reachable from here at all.
         * Falling back to this month keeps the page's old default.
         */
        $chosen = DateWindow::fromRequest($request) ?? $windows['month'];
        $span = [$chosen->from->utc()->toDateTimeString(), $chosen->to->utc()->toDateTimeString()];

        $byType = CertificateClearance::whereBetween('created_at', $span)
            ->selectRaw('certificate_type, COUNT(*) as total')
            ->groupBy('certificate_type')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'certificate_type' => $row->certificate_type,
                'total' => (int) $row->total,
            ]);

        $byStatus = CertificateClearance::whereBetween('created_at', $span)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->map(fn ($n) => (int) $n);

        /*
         * Who asked, and how often.
         *
         * Read two ways: it answers "how many has this resident asked for",
         * and a name near the top of it is worth a second look — the same
         * clearance requested four times in a month is usually one that was
         * never collected.
         */
        $perResident = CertificateClearance::whereBetween('created_at', $span)
            ->whereNotNull('resident_id')
            ->selectRaw('resident_id, COUNT(*) as total')
            ->groupBy('resident_id')
            ->orderByDesc('total')
            ->limit(20)
            ->get();

        $residents = Resident::whereIn('id', $perResident->pluck('resident_id'))
            ->get(['id', 'resident_number', 'first_name', 'middle_name', 'last_name', 'suffix'])
            ->keyBy('id');

        return $this->success([
            'as_of' => DateWindow::now()->toDateTimeString(),
            'counts' => $counts,
            /*
             * The window that was actually applied, named. `period` stays for
             * the tile strip, which highlights one of the five; `window`
             * carries a named month or year, which is not one of them.
             */
            'period' => $windows->has($chosen->key) ? $chosen->key : null,
            'window' => $chosen->toArray(),
            'years' => DateWindow::yearsFrom(CertificateClearance::min('created_at')),
            'period_from' => $chosen->from->toDateString(),
            'period_to' => $chosen->to->toDateString(),
            'by_type' => $byType,
            'by_status' => $byStatus,
            'by_resident' => $perResident->map(fn ($row) => [
                'resident_id' => $row->resident_id,
                'name' => $residents[$row->resident_id]->full_name ?? '—',
                'resident_number' => $residents[$row->resident_id]->resident_number ?? null,
                'total' => (int) $row->total,
            ])->values(),
        ], 'Certificate report');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'resident_id' => 'required|exists:residents,id',
            // Optional: when omitted this is a walk-in and we create the request.
            'service_request_id' => 'nullable|exists:service_requests,id',
            'certificate_type' => 'required|in:' . implode(',', CertificateCatalogue::typeNames()),
            'purpose' => 'required|string',
            /*
             * What the printed form asks for and the register does not know
             * — the hour of a death, a partner's name, the work applied for.
             * Free-form by key because the keys differ per type; the
             * catalogue says which ones this type expects.
             */
            'template_fields' => 'nullable|array',
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

        /*
         * Fee follows the ordinance; exempt is free; an explicit amount wins.
         *
         * The type alone is not always enough to price it — a clearance is
         * priced by its purpose and a business clearance by the kind of
         * business — so the deciding answer is read out of the document's
         * own fields, which is where the clerk just typed it.
         */
        $isExempt = $validated['is_exempt'] ?? false;
        $choice = $this->priceDecidingAnswer($validated['certificate_type'], $validated);

        $validated['fee_amount'] = $isExempt
            ? 0
            : ($validated['fee_amount']
                ?? CertificateCatalogue::feeFor($validated['certificate_type'], $choice)
                ?? 0);

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

    /**
     * The photograph for a Barangay Clearance with Picture.
     *
     * Taken at the counter and uploaded. Refused once the document has been
     * printed, for the same reason the wording is: after that, the paper in
     * the resident's hand and the record here must agree.
     *
     * The two thumbmarks are NOT uploaded. They are inked onto the printed
     * sheet, and a system that offered to capture them would be claiming to
     * have witnessed something it did not.
     */
    public function uploadPhoto(Request $request, CertificateClearance $certificate)
    {
        if (! CertificateCatalogue::needsPhoto($certificate->certificate_type)) {
            return $this->error(
                'A ' . $certificate->certificate_type . ' does not carry a photograph. '
                    . 'Change the type to "Barangay Clearance with Picture" first.',
                422
            );
        }

        if ($certificate->printed_at) {
            return $this->error(
                'This certificate has already been printed, so its photograph can no longer be changed.',
                409
            );
        }

        $request->validate(['photo' => 'required|image|max:5120']);

        /* The one it replaces goes, rather than accumulating in storage. */
        if ($certificate->photo_path) {
            Storage::disk('public')->delete($certificate->photo_path);
        }

        $certificate->update([
            'photo_path' => $request->file('photo')->store('certificate-photos', 'public'),
        ]);

        return $this->success(
            $certificate->fresh(),
            'Photograph attached. It prints in the box beside the thumbmarks.'
        );
    }

    /**
     * Which of the document's own answers sets its price.
     *
     * For most types nothing does and the fee is flat. For a clearance it is
     * the purpose — which the form already asks for as its own column — and
     * for a business clearance it is the kind of business, which lives in
     * the template fields.
     */
    private function priceDecidingAnswer(string $type, array $data): ?string
    {
        $field = CertificateCatalogue::TYPES[$type]['fee_field'] ?? null;

        if (! $field) {
            return null;
        }

        return $field === 'purpose'
            ? ($data['purpose'] ?? null)
            : ($data['template_fields'][$field] ?? null);
    }

    /**
     * The whole schedule and every form the barangay issues.
     *
     * One call rather than three: the counter screen needs the types, the
     * questions each one asks, and all seventy-odd amounts at the same
     * moment — it is filling in one form.
     */
    public function feeSchedule()
    {
        return $this->success(
            CertificateCatalogue::forClient(),
            'Certificate catalogue and the fee schedule of Ordinance of 18 January 2020'
        );
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
            'certificate_type' => 'sometimes|in:' . implode(',', CertificateCatalogue::typeNames()),
            'purpose' => 'sometimes|string|max:255',
            'template_fields' => 'nullable|array',
        ]);

        /*
         * The purpose moves the price too, not only the type — correcting
         * "Loan Purposes" to "Mayor's Permit" is a ₱160 correction. Repricing
         * only on a type change left the old amount on the record.
         */
        $reprice = (isset($validated['certificate_type'])
                && $validated['certificate_type'] !== $certificate->certificate_type)
            || (isset($validated['purpose']) && $validated['purpose'] !== $certificate->purpose);

        if ($reprice && ! $certificate->is_exempt) {
            $type = $validated['certificate_type'] ?? $certificate->certificate_type;

            $validated['fee_amount'] = CertificateCatalogue::feeFor(
                $type,
                $this->priceDecidingAnswer($type, [
                    'purpose' => $validated['purpose'] ?? $certificate->purpose,
                    'template_fields' => $validated['template_fields']
                        ?? $certificate->template_fields
                        ?? [],
                ])
            ) ?? 0;
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
    /*
     * There is no cancel.
     *
     * The office decided a filed request is not withdrawn — it is worked, or
     * it waits. Removing the button alone would have left the endpoint
     * answering to anything that could still find it, so the rule is enforced
     * where the rule lives rather than where it is displayed.
     *
     * The Cancelled STATUS stays: four certificates already carry it, and a
     * record of what happened is not the same as permission to do it again.
     */
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
