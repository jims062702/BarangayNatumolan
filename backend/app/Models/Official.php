<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Official extends Model
{
    protected $fillable = [
        'group',
        'position',
        'name',
        'term',
        'photo_path',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected $appends = ['photo_url'];

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path ? asset(Storage::url($this->photo_path)) : null;
    }

    /**
     * Order so the head (Punong Barangay / SK Chairperson) is always first,
     * then kagawads, then secretary, then treasurer.
     */
    public function scopeOrdered($query)
    {
        return $query
            ->orderByRaw(
                "CASE position
                    WHEN 'Punong Barangay' THEN 1
                    WHEN 'SK Chairperson' THEN 1
                    WHEN 'Barangay Kagawad' THEN 2
                    WHEN 'SK Kagawad' THEN 2
                    WHEN 'Barangay Secretary' THEN 3
                    WHEN 'SK Secretary' THEN 3
                    WHEN 'Barangay Treasurer' THEN 4
                    WHEN 'SK Treasurer' THEN 4
                    ELSE 5 END"
            )
            ->orderBy('sort_order')
            ->orderBy('id');
    }
}
