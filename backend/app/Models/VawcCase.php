<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VawcCase extends Model
{
    protected $fillable = [
        'case_code',
        'survivor_id',
        'violence_type',
        'relationship_to_offender',
        'children_involved',
        'children_count',
        'immediate_needs',
        'previous_incidents_count',
        'assigned_vawc_officer',
        'status',
        'confidential_notes',
        'report_date',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'children_involved' => 'boolean',
            'report_date' => 'date',
            'closed_at' => 'datetime',
            // Confidential content is encrypted at rest (spec requirement).
            'immediate_needs' => 'encrypted',
            'confidential_notes' => 'encrypted',
        ];
    }

    public function survivor(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'survivor_id');
    }

    public function officer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_vawc_officer');
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(VawcIncident::class);
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(VawcReferral::class);
    }

    public function followups(): HasMany
    {
        return $this->hasMany(VawcFollowup::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(VawcDocument::class);
    }

    public function accessLogs(): HasMany
    {
        return $this->hasMany(VawcAccessLog::class);
    }
}
