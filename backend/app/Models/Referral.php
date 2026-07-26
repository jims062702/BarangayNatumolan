<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Referral extends Model
{
    protected $fillable = [
        'referral_number',
        'service_request_id',
        'resident_id',
        'referring_office',
        'receiving_office',
        'referral_reason',
        'required_information',
        'referral_date',
        'acknowledgment_date',
        'services_provided',
        'referral_outcome',
        'followup_date',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'referral_date' => 'date',
            'acknowledgment_date' => 'date',
            'followup_date' => 'date',
        ];
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class);
    }
}
