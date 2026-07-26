<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LuponSettlement extends Model
{
    protected $fillable = [
        'lupon_case_id',
        'settlement_type',
        'terms',
        'date_agreed',
        'repudiation_deadline',
        'status',
        'compliance_deadline',
        'compliance_notes',
        'cfa_issued',
        'cfa_issued_at',
        'cba_issued',
        'cba_issued_at',
        'closed_at',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'date_agreed' => 'date',
            'repudiation_deadline' => 'date',
            'compliance_deadline' => 'date',
            'cfa_issued' => 'boolean',
            'cba_issued' => 'boolean',
            'cfa_issued_at' => 'datetime',
            'cba_issued_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function luponCase(): BelongsTo
    {
        return $this->belongsTo(LuponCase::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
