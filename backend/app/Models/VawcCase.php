<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VawcCase extends Model
{
    /**
     * How urgent this case is, from most to least.
     *
     * One scale for the whole module. Words rather than colours, because a
     * colour is unreadable to a screen reader and indistinguishable to a
     * colour-blind officer — and this is the field that decides who gets
     * visited first.
     */
    public const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low'];

    /**
     * How a follow-up's safety finding moves the case's risk level.
     *
     * Risk is not a fact about the day a case was filed. A survivor found
     * safe on a home visit is not still Critical, and one found in danger is
     * not still Low because that is what the first interview concluded. So
     * every follow-up re-states it.
     *
     * "Unknown" moves nothing on purpose: it says the officer could not
     * tell, which is not the same as finding somebody safe, and letting it
     * lower a Critical case would be the most dangerous thing this table
     * could do.
     */
    public const RISK_FROM_SAFETY = [
        'Safe' => 'Low',
        'At Risk' => 'High',
        'Critical' => 'Critical',
    ];

    /**
     * Re-states the risk from a follow-up's finding.
     *
     * Called wherever a follow-up is recorded, so the docket shows what was
     * last actually seen rather than what was first assumed.
     */
    public function reassessRiskFrom(?string $safetyStatus, ?string $on = null): void
    {
        $level = self::RISK_FROM_SAFETY[$safetyStatus] ?? null;

        if ($level === null) {
            return;
        }

        $this->update([
            'risk_level' => $level,
            'risk_assessed_at' => $on ?: now(),
        ]);
    }
    protected $fillable = [
        'case_code',
        'survivor_id',
        // Who brought the complaint, when that is not the survivor.
        'reported_by_name',
        'reported_by_relationship',
        'reported_by_contact',
        'violence_type',
        'risk_level',
        'risk_assessed_at',
        'reporting_channel',
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
            'risk_assessed_at' => 'datetime',
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
