<?php

namespace App\Models;

use App\Support\SequenceNumber;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CertificateClearance extends Model
{
    protected $table = 'certificates_clearances';

    /**
     * The counter workflow, in order — three presses from request to hand-over.
     *
     * The resident asks and the CLERK does every step. There is no approve or
     * reject decision anywhere on this line, and no signature step either:
     * the Punong Barangay signs the paper, which is a thing that happens at a
     * desk, not a button someone has to remember to click. Printing IS the
     * moment the document exists and starts heading for the counter, so it
     * lands straight on `Ready to Claim`.
     *
     * The one exit is `Cancelled`, for a request that should never have been
     * filed.
     */
    public const FLOW = [
        'Pending',         // requested online, nobody has started it
        'Processing',      // a clerk accepted it and is preparing the document
        'Ready to Claim',  // printed, signed, waiting on the counter
        'Released',        // handed to the resident
    ];

    public const CANCELLED = 'Cancelled';

    /** Every status the column may hold, including the off-ramp. */
    public const STATUSES = [...self::FLOW, self::CANCELLED];

    protected $fillable = [
        'certificate_number',
        'resident_id',
        'service_request_id',
        'certificate_type',
        'purpose',
        'requirements_checklist',
        'fee_amount',
        'is_exempt',
        'exemption_reason',
        'status',
        'processed_by',
        'processed_at',
        'printed_at',
        'signed_by',
        'signed_at',
        'ready_at',
        'claimed_at',
        'cancel_reason',
        'released_by',
        'released_at',
        'qr_code',
        'reference_number',
        'reprint_count',
    ];

    protected $casts = [
        'fee_amount' => 'decimal:2',
        'is_exempt' => 'boolean',
        'processed_at' => 'datetime',
        'printed_at' => 'datetime',
        'signed_at' => 'datetime',
        'ready_at' => 'datetime',
        'claimed_at' => 'datetime',
        'released_at' => 'datetime',
        'requirements_checklist' => 'array',
    ];

    /** Next sequential certificate number (CERT-YYYY-000001). */
    public static function nextCertificateNumber(): string
    {
        return SequenceNumber::next(
            'certificates_clearances',
            'certificate_number',
            'CERT-' . date('Y') . '-',
            6
        );
    }

    /** Next public verification reference number. */
    public static function nextReferenceNumber(): string
    {
        return strtoupper(uniqid('REF-'));
    }

    /**
     * Where this certificate sits on the line (0-based), or null once it has
     * left it. Used to enforce "one step at a time" without a switch in every
     * action.
     */
    public function flowIndex(): ?int
    {
        $index = array_search($this->status, self::FLOW, true);

        return $index === false ? null : $index;
    }

    /** True while the document can still be corrected or cancelled. */
    public function isBeforePrinting(): bool
    {
        return in_array($this->status, ['Pending', 'Processing'], true);
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class);
    }

    /** The clerk who picked the request up off the queue. */
    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    /** The Punong Barangay / Secretary who signed the printed document. */
    public function signer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'signed_by');
    }

    public function releaser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'released_by');
    }
}
