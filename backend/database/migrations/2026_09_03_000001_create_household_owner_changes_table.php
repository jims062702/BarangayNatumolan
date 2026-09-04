<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who owned this house before, and why it changed hands.
 *
 * `households.household_head_id` holds one name and is overwritten in place,
 * so every previous owner was erased by the next one. A house is sold,
 * inherited, left to whoever stayed behind — and the register could not say
 * any of that had happened, let alone to whom.
 *
 * The reason matters as much as the name. "Sold" and "the owner died" leave
 * the same single value in that column and mean entirely different things to
 * the next clerk who has to certify who lives there.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('household_owner_changes', function (Blueprint $table) {
            $table->id();

            $table->foreignId('household_id')->constrained()->cascadeOnDelete();

            /*
             * Both sides are nullable, and both cases are real: null FROM is
             * the first owner a house ever had, and null TO is a house left
             * without one — the owner deleted, or moved out with nobody
             * named yet. Recording the gap is the point; a house with no
             * owner is a fact the office needs to see.
             */
            $table->foreignId('from_resident_id')->nullable()
                ->constrained('residents')->nullOnDelete();
            $table->foreignId('to_resident_id')->nullable()
                ->constrained('residents')->nullOnDelete();

            /*
             * Kept as free text rather than an enum. The list below is what
             * the form offers, but a barangay meets arrangements no schema
             * anticipated, and a clerk forced to pick the nearest wrong
             * option records something false.
             *
             *   Sold · Inherited · Owner died · Owner moved out ·
             *   Entrusted to a caretaker · Correction of record · Other
             */
            $table->string('reason', 60)->nullable();

            /** Anything the reason alone does not carry. */
            $table->string('note', 255)->nullable();

            /*
             * When it actually changed hands, which is rarely the day the
             * office was told. A sale in January recorded in March is a
             * sale in January.
             */
            $table->date('changed_on')->nullable();

            $table->foreignId('recorded_by')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->timestamps();

            // The history of one house, newest first — the only way it is read.
            $table->index(['household_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('household_owner_changes');
    }
};
