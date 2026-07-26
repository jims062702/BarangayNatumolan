<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LuponHearing extends Model
{
    protected $fillable = [
        'lupon_case_id',
        'hearing_type',
        'scheduled_at',
        'status',
        'summons_issued',
        'summons_served_date',
        'complainant_present',
        'respondent_present',
        'attendance_notes',
        'proceedings_notes',
        'outcome',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'summons_served_date' => 'date',
            'summons_issued' => 'boolean',
            'complainant_present' => 'boolean',
            'respondent_present' => 'boolean',
        ];
    }

    public function luponCase(): BelongsTo
    {
        return $this->belongsTo(LuponCase::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
