<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The signature stopped being a step the clerk has to click through.
 *
 * `Printed` and `For Signature` were two extra presses on a workflow the
 * clerk drives alone, recording something that happens on paper anyway. They
 * collapse into `Ready to Claim`: pressing Print IS the moment the document
 * exists and starts heading for the counter, so the register now reads
 *
 *   Pending → Processing → Ready to Claim → Released
 *
 * `printed_at`, `signed_at` and `signed_by` are kept — they still hold the
 * history of everything issued under the longer workflow.
 */
return new class extends Migration
{
    public function up(): void
    {
        // A printed certificate is on its way to the counter either way, and
        // one already sent up for signature is further along still.
        DB::table('certificates_clearances')
            ->whereIn('status', ['Printed', 'For Signature'])
            ->update(['status' => 'Ready to Claim']);

        // Anything that reached the counter is ready, so stamp the moment if
        // the old workflow never did.
        DB::statement('UPDATE certificates_clearances SET ready_at = COALESCE(ready_at, printed_at, updated_at) WHERE status = ?', ['Ready to Claim']);
    }

    public function down(): void
    {
        // Lossy by nature: the two retired stages cannot be told apart again.
        DB::table('certificates_clearances')
            ->where('status', 'Ready to Claim')
            ->whereNull('signed_at')
            ->update(['status' => 'Printed']);
    }
};
