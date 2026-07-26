<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class LuponCase extends Model
{
    protected $fillable = [
        'case_number',
        'case_title',
        'case_classification',
        'complainant_id',
        'respondent_id',
        'jurisdiction_status',
        'rejection_reason',
        'current_stage',
        'date_filed',
        'date_resolved',
        'notes',
        'assigned_lupon_secretary',
    ];

    protected function casts(): array
    {
        return [
            'date_filed' => 'date',
            'date_resolved' => 'date',
        ];
    }

    public function complainant(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'complainant_id');
    }

    public function respondent(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'respondent_id');
    }

    public function assignedLuponSecretary(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_lupon_secretary');
    }

    public function complaint(): HasOne
    {
        return $this->hasOne(LuponComplaint::class);
    }

    public function hearings(): HasMany
    {
        return $this->hasMany(LuponHearing::class);
    }

    public function settlement(): HasOne
    {
        return $this->hasOne(LuponSettlement::class);
    }
}
