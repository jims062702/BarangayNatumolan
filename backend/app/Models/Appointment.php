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

        /* What actually happened, written by the secretary afterwards. */
        'attendance',
        'started_at',
        'ended_at',
        'minutes',
        'minuted_by',
        'minuted_at',
    ];

    protected $casts = [
        'scheduled_datetime' => 'datetime',
        'cancelled_at' => 'datetime',
        'minuted_at' => 'datetime',
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
