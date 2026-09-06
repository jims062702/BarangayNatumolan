<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A sitting of the Sangguniang Barangay, and the minutes of it.
 *
 * The record the secretary is personally answerable for. Draft minutes are
 * not a record — they become one when the council adopts them at a later
 * session — which is why `status` is a field and not a guess from whether
 * `minutes` is filled in.
 */
class BarangaySession extends Model
{
    protected $fillable = [
        'session_number', 'session_type', 'session_date',
        'called_to_order_at', 'adjourned_at', 'venue',
        'agenda', 'minutes', 'status', 'recorded_by', 'adopted_at',
    ];

    protected function casts(): array
    {
        return [
            'session_date' => 'date',
            'adopted_at' => 'datetime',
        ];
    }

    public function attendees(): HasMany
    {
        return $this->hasMany(BarangaySessionAttendee::class);
    }

    public function recorder()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    /** Present or Late — somebody who was in the room when business was done. */
    public function presentCount(): int
    {
        return $this->attendees
            ->whereIn('attendance', ['Present', 'Late'])
            ->count();
    }
}
