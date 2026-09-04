<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The receipt for one merge — what moved, and what it would take to put it
 * back. Merging is a judgement made on incomplete evidence, so it has to be
 * a decision the office can take back without a database restore.
 */
class ResidentMergeRecord extends Model
{
    protected $table = 'resident_merges';

    protected $fillable = [
        'keeper_id',
        'duplicate_id',
        'moved',
        'restore',
        'notes',
        'merged_by',
        'reversed_at',
        'reversed_by',
    ];

    protected function casts(): array
    {
        return [
            'moved' => 'array',
            'restore' => 'array',
            'notes' => 'array',
            'reversed_at' => 'datetime',
        ];
    }

    public function isReversed(): bool
    {
        return $this->reversed_at !== null;
    }

    public function keeper(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'keeper_id');
    }

    public function duplicate(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'duplicate_id');
    }

    public function mergedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'merged_by');
    }
}
