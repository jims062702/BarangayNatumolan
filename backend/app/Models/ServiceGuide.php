<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceGuide extends Model
{
    protected $fillable = [
        'office',
        'service_name',
        'description',
        'requirements',
        'fees',
        'schedule',
        'keywords',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
