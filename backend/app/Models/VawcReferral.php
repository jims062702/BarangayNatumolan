<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VawcReferral extends Model
{
    protected $fillable = [
        'vawc_case_id',
        'referral_agency',
        'receiving_person',
        'services_requested',
        'referral_date',
        'acknowledgment_date',
        'outcome',
        'followup_schedule',
        'is_completed',
    ];

    protected function casts(): array
    {
        return [
            'referral_date' => 'date',
            'acknowledgment_date' => 'date',
            'followup_schedule' => 'date',
            'is_completed' => 'boolean',
        ];
    }

    public function vawcCase(): BelongsTo
    {
        return $this->belongsTo(VawcCase::class);
    }
}
