<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One official, at one session.
 *
 * A name and a position rather than a user id: a kagawad is not necessarily
 * an account here, and the minutes of a session held in 2026 must still read
 * correctly after that person has left office.
 */
class BarangaySessionAttendee extends Model
{
    protected $fillable = [
        'barangay_session_id', 'name', 'position', 'attendance', 'remarks',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(BarangaySession::class, 'barangay_session_id');
    }
}
