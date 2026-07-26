<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthVisit extends Model
{
    protected $fillable = [
        'patient_id',
        'visit_date',
        'visit_reason',
        'temperature',
        'blood_pressure',
        'heart_rate',
        'symptoms',
        'observations',
        'service_provider_id',
        'consultation_notes',
        'treatment_advice',
        'followup_schedule',
        'referral_recommended',
        'referral_destination',
    ];

    protected function casts(): array
    {
        return [
            'visit_date' => 'date',
            'followup_schedule' => 'date',
            'referral_recommended' => 'boolean',
            'temperature' => 'decimal:2',
        ];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'patient_id');
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'service_provider_id');
    }
}
