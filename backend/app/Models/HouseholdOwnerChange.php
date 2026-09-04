<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One entry in a house's ownership history.
 *
 * Written by Household::handOverTo(), never by hand — a history somebody can
 * append to independently of the change it describes is a history that will
 * eventually disagree with the household record.
 */
class HouseholdOwnerChange extends Model
{
    protected $fillable = [
        'household_id',
        'from_resident_id',
        // Copied in at the hand-over, because the ids are ON DELETE SET NULL
        // and a history that a deletion can blank is not a history.
        'from_name',
        'to_name',
        'to_resident_id',
        'reason',
        'note',
        'changed_on',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return ['changed_on' => 'date'];
    }

    /**
     * What the form offers.
     *
     * Not an enum in the schema: a barangay meets arrangements no list
     * anticipates, and a clerk forced to pick the nearest wrong option
     * records something false. "Other" plus the note carries those.
     */
    public const REASONS = [
        'Sold',
        'Inherited',
        'Owner died',
        'Owner moved out',
        'Entrusted to a caretaker',
        'Correction of record',
        'Other',
    ];

    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }

    /** Null when this is the first owner the house ever had. */
    public function from(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'from_resident_id');
    }

    /** Null when the house was left without an owner. */
    public function to(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'to_resident_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
