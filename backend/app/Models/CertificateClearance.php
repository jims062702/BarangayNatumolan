<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CertificateClearance extends Model
{
    protected $table = 'certificates_clearances';
    
    protected $fillable = [
        'certificate_number',
        'resident_id',
        'service_request_id',
        'certificate_type',
        'purpose',
        'fee_amount',
        'is_exempt',
        'exemption_reason',
        'status',
        'rejection_reason',
        'approved_by',
        'released_by',
        'approved_at',
        'released_at',
        'qr_code',
        'reference_number',
        'reprint_count',
    ];

    protected $casts = [
        'fee_amount' => 'decimal:2',
        'is_exempt' => 'boolean',
        'approved_at' => 'datetime',
        'released_at' => 'datetime',
    ];

    /** Next sequential certificate number (CERT-YYYY-000001). */
    public static function nextCertificateNumber(): string
    {
        $year = date('Y');
        $count = self::whereYear('created_at', $year)->count() + 1;

        return 'CERT-' . $year . '-' . str_pad($count, 6, '0', STR_PAD_LEFT);
    }

    /** Next public verification reference number. */
    public static function nextReferenceNumber(): string
    {
        return strtoupper(uniqid('REF-'));
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function releaser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'released_by');
    }
}
