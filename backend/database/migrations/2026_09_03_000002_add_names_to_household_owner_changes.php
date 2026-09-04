<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The names, written down — not just pointed at.
 *
 * The ids alone were not a history. Both sides are ON DELETE SET NULL, so
 * deleting a resident emptied every entry that named them: an entry reading
 * "Bumili → Katiwala, entrusted to a caretaker" became "Bumili → nobody",
 * and the entry recording the loss of the owner came out "nobody → nobody".
 * The record that existed to remember a person was erased by that person
 * being erased.
 *
 * So the name is copied in at the moment of the hand-over. The foreign keys
 * stay — they still link to the profile while the resident is on file — but
 * the history no longer depends on that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('household_owner_changes', function (Blueprint $table) {
            /*
             * The name AS IT STOOD when the house changed hands. Not looked
             * up later: somebody who marries and takes a new surname did not
             * retroactively buy the house under it.
             */
            $table->string('from_name', 150)->nullable()->after('from_resident_id');
            $table->string('to_name', 150)->nullable()->after('to_resident_id');
        });

        /*
         * Fill in what can still be recovered. Entries whose resident is
         * already gone stay blank — the name is genuinely lost, and writing
         * a guess would be worse than an honest gap.
         */
        foreach (['from', 'to'] as $side) {
            DB::table('household_owner_changes as c')
                ->join('residents as r', 'r.id', '=', "c.{$side}_resident_id")
                ->update([
                    "c.{$side}_name" => DB::raw(
                        "TRIM(CONCAT_WS(' ', r.first_name, r.middle_name, r.last_name, r.suffix))"
                    ),
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('household_owner_changes', function (Blueprint $table) {
            $table->dropColumn(['from_name', 'to_name']);
        });
    }
};
