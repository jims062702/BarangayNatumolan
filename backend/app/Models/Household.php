<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Household extends Model
{
    protected $fillable = [
        'household_number',
        'household_head_id',
        'zone_purok',
        'street_address',
        'house_type',
        'total_members',
        'notes',
    ];

    public function residents(): HasMany
    {
        return $this->hasMany(Resident::class);
    }

    public function head(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'household_head_id');
    }
}
