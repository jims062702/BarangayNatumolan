<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaternalHealth extends Model
{
    protected $table = 'maternal_health';

    protected $fillable = [
        'mother_id',
        'pregnancy_registration_date',
        'expected_delivery_date',
        'actual_delivery_date',
        'prenatal_visits_count',
        'risk_indicators',
        'post_natal_followup_required',
        'family_planning_method',
        'family_planning_counseling_notes',
        'maternal_immunization_received',
        'referral_to_hospital',
        'referral_reason',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'pregnancy_registration_date' => 'date',
            'expected_delivery_date' => 'date',
            'actual_delivery_date' => 'date',
            'post_natal_followup_required' => 'boolean',
            'maternal_immunization_received' => 'boolean',
            'referral_to_hospital' => 'boolean',
        ];
    }

    public function mother(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'mother_id');
    }
}
