<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VawcDocument extends Model
{
    protected $fillable = [
        'vawc_case_id',
        'document_type',
        'title',
        'description',
        'file_reference',
        'uploaded_by',
    ];

    protected function casts(): array
    {
        return [
            'description' => 'encrypted',
        ];
    }

    public function vawcCase(): BelongsTo
    {
        return $this->belongsTo(VawcCase::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
