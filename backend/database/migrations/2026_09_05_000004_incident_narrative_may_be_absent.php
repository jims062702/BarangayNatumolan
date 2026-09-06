<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * An incident may be recorded before anybody has written the story down.
 *
 * `incident_narrative` was NOT NULL from when it was the only thing an
 * incident row held. It is not any more: the row now also carries when and
 * where it happened, whether it is still happening, and whether the person
 * complained of is near her right now.
 *
 * Those four are the answers a VAWC officer needs at the desk, and the most
 * urgent case of all — "he is in the house right now", taken down in a hurry
 * with no narrative yet — could not be saved at all. It failed with a
 * constraint violation, which is the worst possible moment for a form to
 * refuse.
 *
 * A missing narrative is a narrative not yet written, not an error.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Raw SQL: the column is encrypted at rest, and Laravel's ->change()
        // would need doctrine/dbal to read a type it cannot introspect.
        DB::statement('ALTER TABLE vawc_incidents MODIFY incident_narrative TEXT NULL');
    }

    public function down(): void
    {
        /*
         * Rows written without one would block the constraint coming back, so
         * they are given an empty string first. Nothing is lost: an empty
         * narrative is what they already say.
         */
        DB::statement("UPDATE vawc_incidents SET incident_narrative = '' WHERE incident_narrative IS NULL");
        DB::statement('ALTER TABLE vawc_incidents MODIFY incident_narrative TEXT NOT NULL');
    }
};
