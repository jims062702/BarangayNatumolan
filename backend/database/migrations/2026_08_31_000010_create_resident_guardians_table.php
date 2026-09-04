<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who is actually raising a child, when it is not their parents.
 *
 * A common shape in this barangay: both parents work abroad or in another
 * city, the child is left with a lola, a tita or a neighbour, and the CHILD
 * is the bona fide resident while neither parent is one. The register had
 * nowhere to put that, so the only way to record the carer was to enter them
 * as a "parent" labelled Guardian.
 *
 * That is not a small inaccuracy. Parent links are what siblings, aunts,
 * uncles and grandparents are DERIVED from, so a lola recorded as a parent
 * turns her own children into the child's brothers and sisters, and her
 * parents into the child's grandparents. One convenience quietly rewrites the
 * family tree.
 *
 * So guardianship gets its own table. It is a CARE ARRANGEMENT, not a
 * bloodline: it has a start and an end, a reason, and it derives nothing.
 * The real parents stay on the record as the parents they are, wherever in
 * the world they are living.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resident_guardians', function (Blueprint $table) {
            $table->id();
            // The child.
            $table->unsignedBigInteger('ward_id');
            // Whoever is raising them — very often already on the register as
            // the head of the household the child lives in.
            $table->unsignedBigInteger('guardian_id');
            /*
             * How the guardian is related to the child, in the barangay's own
             * words: Grandmother (Lola), Aunt (Tita), Elder sibling, Neighbour.
             * Free text because "kahit sino" is the honest answer — the person
             * who took the child in is not always a relative at all.
             */
            $table->string('relation', 40)->nullable();
            // Why the parents are not the ones raising them. Kept from a short
            // list so the barangay can count them, with room for the rest.
            $table->string('reason', 60)->nullable();
            $table->date('started_on')->nullable();
            /*
             * Set when the arrangement ends — the parents come home, the child
             * turns 18, the child moves. The row stays: a child's care history
             * is exactly the sort of thing that is asked about years later.
             */
            $table->date('ended_on')->nullable();
            $table->string('end_reason', 60)->nullable();
            /*
             * Who to knock for and who signs. A child may be left with a
             * couple, or with a lola who is often away — one of them has to be
             * the person the barangay actually calls.
             */
            $table->boolean('is_primary')->default(true);
            $table->text('note')->nullable();
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('ward_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->foreign('guardian_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->foreign('recorded_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['ward_id', 'ended_on']);
            $table->index(['guardian_id', 'ended_on']);
        });

        /*
         * Anyone already entered as a "parent" whose role reads Guardian was a
         * carer being filed in the only box available. Move them across, and
         * take the parent link away with them — leaving it behind is what
         * keeps the wrong siblings on the child's profile.
         */
        $misfiled = DB::table('resident_parents')
            ->where('parent_role', 'like', '%uardian%')
            ->get(['child_id', 'parent_id', 'parent_role']);

        foreach ($misfiled as $row) {
            DB::table('resident_guardians')->insert([
                'ward_id' => $row->child_id,
                'guardian_id' => $row->parent_id,
                'relation' => $row->parent_role,
                'note' => 'Moved from the parent list, where guardians used to be recorded.',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('resident_parents')
                ->where('child_id', $row->child_id)
                ->where('parent_id', $row->parent_id)
                ->delete();
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('resident_guardians');
    }
};
