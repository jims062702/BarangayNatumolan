<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OfficeQueue extends Model
{
    protected $table = 'office_queue';

    protected $fillable = [
        'queue_number',
        'service_request_id',
        'resident_id',
        'office',
        'status',
        'queue_time',
        'called_time',
        'served_time',
        'completed_time',
        'wait_time_minutes',
        'served_by',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'queue_time' => 'datetime',
            'called_time' => 'datetime',
            'served_time' => 'datetime',
            'completed_time' => 'datetime',
        ];
    }

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class);
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(User::class, 'served_by');
    }
}
