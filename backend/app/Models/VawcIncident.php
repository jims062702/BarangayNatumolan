<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VawcIncident extends Model
{
    protected $fillable = [
        'vawc_case_id',
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
