<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceRequest extends Model
{
    protected $fillable = [
        'request_number',
        'resident_id',
        'service_type',
        'office',
        'request_type',
        'status',
        'purpose',
        'assigned_to',
        'completed_at',
    ];

    protected $casts = [
        'completed_at' => 'datetime',
    ];

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    /**
     * The certificate this request produced.
     *
     * The LATEST one, explicitly. A request is meant to have exactly one —
     * CertificateController::store now refuses a second — but records made
     * before that guard existed can carry two, and an unordered hasOne
     * returns whichever the database hands back first. That is how a
     * resident came to be shown "Processing" for a document released weeks
     * earlier: the abandoned first attempt happened to have the lower id.
     */
    public function certificate(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(CertificateClearance::class)->latestOfMany();
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class);
    }

    public function officeQueue(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(OfficeQueue::class);
    }
}
