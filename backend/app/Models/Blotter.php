<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One incident reported at the barangay desk.
 *
 * @see \Database\Migrations — blotters
 */
class Blotter extends Model
{
    /**
     * What the desk actually did about it.
     *
     * "Recorded only" is a real answer and the commonest one: somebody wanted
     * it on the record, nothing more. It is not a gap waiting to be filled.
     */
    public const ACTIONS = [
        'Recorded only',
        'Advised the parties',
        'Settled at the desk',
        'Referred to Lupon',
        'Referred to PNP',
        'Referred to other agency',
        'For monitoring',
    ];

    public const TYPES = [
        'Physical Altercation',
        'Verbal Abuse or Threat',
        'Theft',
        'Property Damage',
        'Noise or Disturbance',
        'Trespassing',
        'Missing Person',
        'Accident',
        'Animal Complaint',
        'Drug-related',
        'Other',
    ];

    protected $fillable = [
        'blotter_number', 'recorded_at', 'recorded_by',
        'incident_at', 'place_of_incident', 'incident_type', 'narrative',
        'reporter_id', 'reporter_name', 'reporter_address', 'reporter_contact',
        'action_taken', 'action_notes', 'status', 'closed_at', 'lupon_case_id',
    ];

    protected function casts(): array
    {
        return [
            'recorded_at' => 'datetime',
            'incident_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'reporter_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function luponCase(): BelongsTo
    {
        return $this->belongsTo(LuponCase::class, 'lupon_case_id');
    }

    public function people(): HasMany
    {
        return $this->hasMany(BlotterPerson::class);
    }

    public function subjects(): HasMany
    {
        return $this->people()->where('role', 'Subject');
    }

    public function witnesses(): HasMany
    {
        return $this->people()->where('role', 'Witness');
    }

    /** Whoever reported it, named however the desk had them. */
    public function getReporterLabelAttribute(): string
    {
        return $this->reporter?->full_name ?: ($this->reporter_name ?: 'Not named');
    }
}
