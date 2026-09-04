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
        // Used instead of complainant_id when the complainant lives outside
        // the barangay and therefore has no registry record.
        'complainant_name',
        'complainant_address',
        'complainant_contact',
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

    /** Always appended so the UI never has to branch on resident vs outsider. */
    protected $appends = [
        'complainant_display_name',
        'complainant_is_resident',
        'complainant_display_address',
        'complainant_display_contact',
        'complainant_reference',
        'respondent_display_names',
    ];

    /** The complainant's name, whether they are a resident or an outsider. */
    public function getComplainantDisplayNameAttribute(): string
    {
        if ($this->complainant) {
            return trim($this->complainant->first_name . ' ' . $this->complainant->last_name);
        }

        return $this->complainant_name ?: '—';
    }

    public function getComplainantIsResidentAttribute(): bool
    {
        return $this->complainant_id !== null;
    }

    /*
    |--------------------------------------------------------------------------
    | A complainant who is on the register is not asked twice
    |--------------------------------------------------------------------------
    | Their address, number and household are already recorded, and the
    | register is where they are kept current. Copying them onto the case at
    | filing time would freeze them: a summons served six weeks later would go
    | to the house they have moved out of, and the case would still be showing
    | the old one as if it were fact.
    |
    | So the case READS them, and only stores what it cannot read — the
    | details of a complainant from another barangay, who has no record here.
    */

    /** Where the summons goes. */
    public function getComplainantDisplayAddressAttribute(): ?string
    {
        if ($this->complainant) {
            $household = $this->complainant->household;

            /*
             * A resident's street address lives on their HOUSEHOLD, not on
             * their own record — `residents.address` is for somebody who
             * lives outside the barangay, and is deliberately emptied when
             * such a person is converted to a resident. Reading only their
             * own column gave a purok and no street.
             */
            return trim(implode(', ', array_filter([
                $this->complainant->address ?: $household?->street_address,
                $this->complainant->zone_purok,
                $household?->household_number ? 'Household ' . $household->household_number : null,
            ]))) ?: null;
        }

        return $this->complainant_address;
    }

    /** How the office reaches them. */
    public function getComplainantDisplayContactAttribute(): ?string
    {
        return $this->complainant?->contact_number ?: $this->complainant_contact;
    }

    /**
     * Their resident number, when they have one.
     *
     * Null for somebody from another barangay — which is itself the answer to
     * "is this person on our register?", and the reason the address above had
     * to be typed in by hand.
     */
    public function getComplainantReferenceAttribute(): ?string
    {
        return $this->complainant?->resident_number;
    }

    /** "Dela Cruz, Gasang" — every respondent, for lists and search. */
    public function getRespondentDisplayNamesAttribute(): string
    {
        if (!$this->relationLoaded('respondents')) {
            return '';
        }

        return $this->respondents
            ->map(fn ($r) => trim($r->first_name . ' ' . $r->last_name))
            ->implode(', ');
    }

    public function complainant(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'complainant_id');
    }

    /**
     * Everyone complained against. A dispute with two aggressors is one case
     * with two respondents, not two cases.
     */
    public function respondents()
    {
        return $this->belongsToMany(Resident::class, 'lupon_case_respondents', 'lupon_case_id', 'resident_id')
            ->withTimestamps();
    }

    /** Resident ids of every party — used to notify them of hearings. */
    public function partyResidentIds(): array
    {
        return collect([$this->complainant_id])
            ->merge($this->respondents()->pluck('residents.id'))
            ->filter()
            ->unique()
            ->values()
            ->all();
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
