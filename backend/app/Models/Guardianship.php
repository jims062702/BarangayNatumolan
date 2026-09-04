<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One child in one person's care, from the day it started to the day it ended.
 *
 * Deliberately NOT a parent link. Guardianship says who is raising a child
 * today; parentage says who their mother and father are. Conflating them is
 * what put a lola's own children on her grandchild's profile as siblings.
 *
 * @see \Database\Migrations — resident_guardians
 */
class Guardianship extends Model
{
    protected $table = 'resident_guardians';

    /**
     * Why the parents are not the ones raising the child.
     *
     * A short list rather than free text, because this is a number the
     * barangay is asked for: how many children here are growing up with their
     * parents away. "Other" keeps the door open for the cases a list never
     * covers, and the note beside it carries the detail.
     */
    public const REASONS = [
        'Both parents work abroad (OFW)',
        'One parent works abroad (OFW)',
        'Parents work in another town or city',
        'Parents are deceased',
        'Parents are separated',
        'Parents cannot care for the child',
        'Other',
    ];

    /** How a guardian is usually related to the child. Free text allows more. */
    public const RELATIONS = [
        'Grandmother (Lola)',
        'Grandfather (Lolo)',
        'Aunt (Tita)',
        'Uncle (Tito)',
        'Elder sibling (Ate/Kuya)',
        'Other relative',
        'Family friend / neighbour',
        'Court-appointed guardian',
    ];

    /** Why an arrangement ended. */
    public const END_REASONS = [
        'Parents came home',
        'Child moved to the parents',
        'Child is now of age',
        'Guardian passed away',
        'Child moved out of the barangay',
        'Recorded in error',
        'Other',
    ];

    protected $fillable = [
        'ward_id',
        'guardian_id',
        'relation',
        'reason',
        'started_on',
        'ended_on',
        'end_reason',
        'is_primary',
        'note',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'started_on' => 'date',
            'ended_on' => 'date',
            'is_primary' => 'boolean',
        ];
    }

    /** The child. */
    public function ward(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'ward_id');
    }

    /** Whoever is raising them. */
    public function guardian(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'guardian_id');
    }

    public function isActive(): bool
    {
        return $this->ended_on === null;
    }
}
