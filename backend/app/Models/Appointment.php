<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Appointment extends Model
{
    protected $fillable = [
        'appointment_number',
        'service_request_id',
        'resident_id',
        'office',
        'scheduled_datetime',
        'status',
        'notes',
        'cancelled_at',
        'cancellation_reason',
    ];

    protected $casts = [
        'scheduled_datetime' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class);
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }
}
