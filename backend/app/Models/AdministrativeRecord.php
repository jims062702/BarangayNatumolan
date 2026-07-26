<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdministrativeRecord extends Model
{
    protected $fillable = [
        'document_type',
        'document_number',
        'document_title',
        'document_date',
        'document_content',
        'created_by',
        'approved_by',
        'approved_at',
        'is_archived',
        'file_reference',
        'summary',
    ];

    protected function casts(): array
    {
        return [
            'document_date' => 'date',
            'approved_at' => 'datetime',
            'is_archived' => 'boolean',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
