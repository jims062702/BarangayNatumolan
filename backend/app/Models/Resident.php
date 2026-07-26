<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Resident extends Model
{
    protected $fillable = [
        'resident_number',
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'gender',
        'birthdate',
        'civil_status',
        'occupation',
        'contact_number',
        'email',
        'household_id',
        'residency_status',
        'length_of_residence_years',
        'zone_purok',
        'educational_attainment',
        'demographic_classification',
        'is_active',
        'remarks',
    ];

    protected $casts = [
        'birthdate' => 'date',
        'is_active' => 'boolean',
    ];

    /**
     * The age-derived sector tags the system manages automatically. The
     * `residents:sync-sectors` command reconciles ONLY these; manual tags
     * (Solo Parent, PWD, 4Ps, …) are left untouched.
     */
    public const AGE_SECTORS = ['Child', 'Youth', 'Adult', 'Senior Citizen'];

    /**
     * Age-based sectors for this resident today (mirrors the registration form):
     *   0–14 Child · 15–17 Child + Youth · 18–30 Youth · 31–59 Adult · 60+ Senior.
     * A resident can fall in more than one (the 15–17 overlap).
     */
    public function ageSectors(): array
    {
        $age = $this->birthdate?->age;
        if ($age === null) {
            return [];
        }
        if ($age <= 14) {
            return ['Child'];
        }
        if ($age <= 17) {
            return ['Child', 'Youth'];
        }
        if ($age <= 30) {
            return ['Youth'];
        }
        if ($age <= 59) {
            return ['Adult'];
        }
        return ['Senior Citizen'];
    }

    // Relationships
    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }

    /** The resident's portal login account, if one has been issued. */
    public function account()
    {
        return $this->hasOne(User::class, 'resident_id');
    }

    public function sectors(): HasMany
    {
        return $this->hasMany(ResidentSector::class);
    }

    public function serviceRequests(): HasMany
    {
        return $this->hasMany(ServiceRequest::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(CertificateClearance::class);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function vawcCases(): HasMany
    {
        return $this->hasMany(VawcCase::class, 'survivor_id');
    }

    public function luponCases(): HasMany
    {
        return $this->hasMany(LuponCase::class, 'complainant_id');
    }

    public function healthVisits(): HasMany
    {
        return $this->hasMany(HealthVisit::class, 'patient_id');
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function maternalHealth(): HasMany
    {
        return $this->hasMany(MaternalHealth::class, 'mother_id');
    }

    public function childHealth(): HasMany
    {
        return $this->hasMany(ChildHealth::class, 'child_id');
    }

    public function getFullNameAttribute()
    {
        return trim("{$this->first_name} {$this->middle_name} {$this->last_name} {$this->suffix}");
    }
}
