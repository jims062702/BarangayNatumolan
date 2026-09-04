<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Household extends Model
{
    protected $fillable = [
        'household_number',
        'household_head_id',
        'zone_purok',
        'street_address',
        'house_type',
        'total_members',
        'notes',
    ];

    public function residents(): HasMany
    {
        return $this->hasMany(Resident::class);
    }

    public function head(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'household_head_id');
    }

    /** Every hand-over this house has been through, newest first. */
    public function ownerChanges(): HasMany
    {
        return $this->hasMany(HouseholdOwnerChange::class)->orderByDesc('id');
    }

    /**
     * Changes the owner AND records that it happened.
     *
     * One method, because they are one act. Writing the new owner is what
     * erases the old one, so the entry that remembers them has to be made in
     * the same breath — anything that can set `household_head_id` without
     * going through here will silently lose a name.
     *
     * @param  Resident|null  $to  null leaves the house without an owner,
     *                             which is a real state and worth recording.
     * @return HouseholdOwnerChange|null  null when nothing actually changed.
     */
    public function handOverTo(
        ?Resident $to,
        ?string $reason = null,
        ?string $note = null,
        ?string $changedOn = null
    ): ?HouseholdOwnerChange {
        $from = $this->household_head_id;
        $toId = $to?->id;

        /*
         * The names as they stand right now.
         *
         * Not looked up when the history is read: somebody who marries and
         * takes a new surname did not retroactively buy the house under it,
         * and somebody deleted has no name to look up at all.
         */
        $fromName = $this->head?->full_name;
        $toName = $to?->full_name;

        // Re-saving the same owner is not a hand-over, and an entry saying
        // the house passed from someone to themselves is noise in a history
        // that has to stay readable.
        if ($from === $toId) {
            return null;
        }

        $this->forceFill(['household_head_id' => $toId])->save();

        // The owner lives in the house they own.
        if ($to) {
            $to->forceFill(['household_id' => $this->id])->save();
        }

        return $this->ownerChanges()->create([
            'from_resident_id' => $from,
            'from_name' => $fromName,
            'to_resident_id' => $toId,
            'to_name' => $toName,
            'reason' => $reason,
            'note' => $note,
            'changed_on' => $changedOn ?: now()->toDateString(),
            'recorded_by' => auth()->id(),
        ]);
    }
}
