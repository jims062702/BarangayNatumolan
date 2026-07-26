<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChildHealth extends Model
{
    protected $table = 'child_health';

    protected $fillable = [
        'child_id',
        'birth_date',
        'birth_weight',
        'fully_immunized_status',
        'current_weight',
        'current_height',
        'nutritional_status',
        'growth_monitoring_notes',
        'vitamin_services_received',
        'breastfeeding_status',
        'feeding_counseling_notes',
        'referral_needed',
        'referral_destination',
    ];

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'vitamin_services_received' => 'boolean',
            'referral_needed' => 'boolean',
            'birth_weight' => 'decimal:2',
            'current_weight' => 'decimal:2',
            'current_height' => 'decimal:2',
        ];
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'child_id');
    }
}
