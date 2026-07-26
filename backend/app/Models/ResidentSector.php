<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResidentSector extends Model
{
    protected $fillable = [
        'resident_id',
        'sector_type',
        'enrolled_date',
        'unenrolled_date',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'enrolled_date' => 'date',
            'unenrolled_date' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }
}
