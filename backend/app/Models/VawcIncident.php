<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VawcIncident extends Model
{
    protected $fillable = [
        'vawc_case_id',
        /*
         * When and where it happened, and whether it is still happening.
         *
         * The form used to record only when the complaint was MADE. A
         * prescription period runs from the act, and an officer deciding
         * whether to go tonight needs to know whether the person complained
         * of is in the house right now.
         */
        'occurred_at',
        'location',
        'is_ongoing',
        'offender_nearby',
        'incident_narrative',
        'injury_documentation',
        'medical_certificate_reference',
        'police_report_reference',
        'protection_order_filed',
        'attachments_notes',
        'is_confidential',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'is_ongoing' => 'boolean',
            'offender_nearby' => 'boolean',
            /*
             * The place is encrypted and the date is not, deliberately. A
             * location in a barangay this size names a household; a date on
             * its own names nobody, and it has to stay sortable so a case
             * approaching its prescription period can be found.
             */
            'location' => 'encrypted',
            'protection_order_filed' => 'boolean',
            'is_confidential' => 'boolean',
            'incident_narrative' => 'encrypted',
            'injury_documentation' => 'encrypted',
            'attachments_notes' => 'encrypted',
        ];
    }

    public function vawcCase(): BelongsTo
    {
        return $this->belongsTo(VawcCase::class);
    }
}
