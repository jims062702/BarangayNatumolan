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
        // Who brought the complaint, when that is not the survivor.
        'reported_by_name',
        'reported_by_relationship',
        'reported_by_contact',
        'violence_type',
        'relationship_to_offender',
        'children_involved',
        'children_count',
        'children_details',
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
            'report_date' => 'datetime',
            'closed_at' => 'datetime',
            // Confidential content is encrypted at rest (spec requirement).
            'immediate_needs' => 'encrypted',
            'confidential_notes' => 'encrypted',
            'children_details' => 'encrypted',
        ];
    }

    public function survivor(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'survivor_id');
    }

    /**
     * Children/dependents involved, linked to their registry records so the
     * desk can open them and carry them into a referral.
     */
    public function dependents()
    {
        return $this->belongsToMany(Resident::class, 'vawc_case_dependents', 'vawc_case_id', 'resident_id')
            ->withTimestamps();
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
