<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Somebody named in a blotter entry — a subject or a witness.
 *
 * `resident_id` where they are one of ours, a typed name where they are not.
 * An incident does not confine itself to people on the register, and a desk
 * that could only write down residents would be writing down half of what
 * happened.
 */
class BlotterPerson extends Model
{
    public const ROLES = ['Subject', 'Witness'];

    protected $fillable = ['blotter_id', 'role', 'resident_id', 'name', 'address', 'contact'];

    public function blotter(): BelongsTo
    {
        return $this->belongsTo(Blotter::class);
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    /** The registry name where there is one, otherwise what was written. */
    public function getLabelAttribute(): string
    {
        return $this->resident?->full_name ?: ($this->name ?: 'Unnamed');
    }
}
