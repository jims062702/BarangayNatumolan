<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Marriage as a HISTORY, not a single pointer.
 *
 * `residents.spouse_id` could only ever say who someone is married to now, so
 * a widow re-marrying erased the fact that she had been married before — and
 * with it the reason, which is the part the barangay actually needs when a
 * resident asks why a certificate names a different spouse than their
 * children's records do.
 *
 * Each marriage keeps its own row: when it started, when it ended, why, and
 * who died if that was the reason. `spouse_id` stays on the resident row as
 * the fast "who now?" pointer, kept in step with whichever row is still open.
 *
 * `shown_to_children` is consent, not a setting: a separation is the parents'
 * business, and it only appears on a child's own family view when the family
 * has agreed it may.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resident_marriages', function (Blueprint $table) {
            $table->id();
            // Symmetric: either column may hold either partner, so every read
            // looks at both. Storing it twice would be two rows to keep true.
            $table->unsignedBigInteger('resident_id');
            $table->unsignedBigInteger('spouse_id');
            $table->date('married_on')->nullable();
            $table->date('ended_on')->nullable();
            $table->string('end_reason', 40)->nullable();
            $table->text('end_notes')->nullable();
            // Set only when the marriage ended in death, so the SURVIVOR can
            // be marked widowed and the right person is named.
            $table->unsignedBigInteger('deceased_id')->nullable();
            $table->boolean('shown_to_children')->default(false);
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('resident_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->foreign('spouse_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->foreign('deceased_id')->references('id')->on('residents')->nullOnDelete();
            $table->foreign('recorded_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['resident_id', 'ended_on']);
            $table->index(['spouse_id', 'ended_on']);
        });

        /*
         * Every marriage already on the register becomes an open row. The
         * pointer is mutual, so each couple appears twice — taking only the
         * lower id as `resident_id` records each marriage exactly once.
         */
        $couples = DB::table('residents')
            ->whereNotNull('spouse_id')
            ->whereColumn('id', '<', 'spouse_id')
            ->get(['id', 'spouse_id']);

        foreach ($couples as $couple) {
            DB::table('resident_marriages')->insert([
                'resident_id' => $couple->id,
                'spouse_id' => $couple->spouse_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('resident_marriages');
    }
};
