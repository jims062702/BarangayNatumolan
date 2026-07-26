<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LuponComplaint extends Model
{
    protected $fillable = [
        'lupon_case_id',
        'complaint_narrative',
        'date_of_occurrence',
        'place_of_occurrence',
        'residency_verified',
        'relationship_nature',
        'has_previous_settlement',
        'previous_settlement_notes',
        'complaint_received_date',
    ];

    protected function casts(): array
    {
        return [
            'date_of_occurrence' => 'date',
            'complaint_received_date' => 'date',
            'has_previous_settlement' => 'boolean',
        ];
    }

    public function luponCase(): BelongsTo
    {
        return $this->belongsTo(LuponCase::class);
    }
}
