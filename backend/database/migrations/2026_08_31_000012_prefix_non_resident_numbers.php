<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives the records of people who do not live here a number that says so.
 *
 * Residents and non-residents share one table, one search and one picker, and
 * both carried the same bare "2026-000034". A clerk reading it had no way to
 * tell whether the person in front of them was a constituent — which decides
 * whether anything may be issued to them at all.
 *
 * Only the non-residents are renumbered. A resident's number is printed on
 * certificates already in people's hands and quoted on the public
 * verification page; changing it would invalidate paper the barangay issued.
 * A non-resident cannot hold a certificate, so nothing points at theirs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $year = date('Y');
        $sequence = 0;

        $existing = DB::table('residents')
            ->where('record_type', 'Non-resident')
            ->where('resident_number', 'not like', 'NR-%')
            ->orderBy('id')
            ->get(['id']);

        foreach ($existing as $row) {
            DB::table('residents')->where('id', $row->id)->update([
                'resident_number' => 'NR-' . $year . '-' . str_pad(++$sequence, 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    public function down(): void
    {
        /*
         * Deliberately not reversed. The bare numbers these replaced were
         * drawn from the same sequence the residents use, so handing them
         * back would risk colliding with a number since issued to somebody
         * who actually lives here.
         */
    }
};
