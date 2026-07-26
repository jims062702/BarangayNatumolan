<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VawcFollowup extends Model
{
    protected $fillable = [
        'vawc_case_id',
        'followup_date',
        'followup_type',
        'safety_status',
        'bpo_compliance',
        'referral_attended',
        'services_received',
        'notes',
        'next_followup_date',
        'closure_recommended',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'followup_date' => 'date',
            'next_followup_date' => 'date',
            'referral_attended' => 'boolean',
            'closure_recommended' => 'boolean',
            'notes' => 'encrypted',
        ];
    }

    public function vawcCase(): BelongsTo
    {
        return $this->belongsTo(VawcCase::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
