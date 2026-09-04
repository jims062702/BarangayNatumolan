<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One marriage, from the day it was recorded to the day it ended.
 *
 * A resident may have several over a lifetime — a widow re-marries, a
 * separated couple each start again — and the barangay needs the ones that
 * ended as much as the one that has not, because that is what explains why an
 * older certificate names a different spouse.
 *
 * The two id columns are symmetric: either may hold either partner, so every
 * query looks at both rather than trusting an order.
 */
class ResidentMarriage extends Model
{
    /** Why a union ended. Anything else is recorded in `end_notes`. */
    public const END_REASONS = ['Separated', 'Annulled', 'Divorced', 'Widowed', 'Other'];

    /**
     * Married, or living together without being married. Both are unions for
     * the purpose that matters here — their children belong to both of them —
     * but only one of them changes a civil status.
     */
    public const LIVE_IN = 'Live-in';

    public const UNION_TYPES = ['Married', self::LIVE_IN];

    protected $fillable = [
        'resident_id',
        'spouse_id',
        'union_type',
        'married_on',
        'ended_on',
        'end_reason',
        'end_notes',
        'deceased_id',
        'shown_to_children',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'married_on' => 'date',
            'ended_on' => 'date',
            'shown_to_children' => 'boolean',
        ];
    }

    /** Rows involving this resident, whichever column they sit in. */
    public function scopeInvolving($query, int $residentId)
    {
        return $query->where(fn ($q) => $q->where('resident_id', $residentId)
            ->orWhere('spouse_id', $residentId));
    }

    /** Still going: no end date recorded. */
    public function scopeOpen($query)
    {
        return $query->whereNull('ended_on');
    }

    public function hasEnded(): bool
    {
        return $this->ended_on !== null;
    }

    public function isLiveIn(): bool
    {
        return $this->union_type === self::LIVE_IN;
    }

    /** "marriage" or "partnership", for messages the office reads. */
    public function noun(): string
    {
        return $this->isLiveIn() ? 'partnership' : 'marriage';
    }

    /** The partner who is NOT the resident being viewed. */
    public function partnerOf(int $residentId): ?Resident
    {
        return $this->resident_id === $residentId ? $this->spouse : $this->resident;
    }

    /**
     * The civil status this ending leaves the SURVIVING partner in. A death
     * widows them; a separation or annulment returns them to single or
     * separated. Null where the reason says nothing about status.
     */
    public function resultingCivilStatus(): ?string
    {
        /*
         * A live-in partnership never changed anyone's civil status, so its
         * ending must not either — someone who was legally Single does not
         * become Widowed or Separated because a partnership ended.
         */
        if ($this->isLiveIn()) {
            return null;
        }

        return match ($this->end_reason) {
            'Widowed' => 'Widowed',
            'Separated' => 'Separated',
            'Annulled', 'Divorced' => 'Single',
            default => null,
        };
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'resident_id');
    }

    public function spouse(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'spouse_id');
    }

    public function deceased(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'deceased_id');
    }
}
