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

    // Relationships
    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
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
