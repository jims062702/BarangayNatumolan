<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResidentSector extends Model
{
    /**
     * Sectors that are a REGISTRATION somebody holds, not a judgement the
     * barangay makes. Each is granted by an office that issues a card for it,
     * and each carries benefits — so each needs its reference recorded.
     */
    public const PROOF_REQUIRED = ['Solo Parent'];

    protected $fillable = [
        'resident_id',
        'sector_type',
        'reference_no',
        'issued_on',
        'valid_until',
        'note',
        'enrolled_date',
        'unenrolled_date',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'enrolled_date' => 'date',
            'unenrolled_date' => 'date',
            'issued_on' => 'date',
            'valid_until' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }
}
