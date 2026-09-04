<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every merge, recorded in enough detail to be UNDONE.
 *
 * Merging is a judgement call made on incomplete evidence — two people really
 * can share a name and a birthday — so it has to be a decision the barangay
 * can take back. Without this, the only remedy for a wrong merge is a
 * database restore, which no barangay office is going to have on hand.
 *
 * `moved` records the actual row ids that changed hands, per table and
 * column, and `restore` holds everything that was overwritten or deleted, so
 * reversing is a replay rather than a guess.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resident_merges', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('keeper_id');
            $table->unsignedBigInteger('duplicate_id');
            /** {table: {column: [row ids]}} — what moved onto the keeper. */
            $table->json('moved');
            /**
             * What would otherwise be lost: fields copied onto the keeper,
             * rows deleted as duplicates of ones it already had, previous
             * household owners, and the portal account's former state.
             */
            $table->json('restore');
            $table->json('notes')->nullable();
            $table->unsignedBigInteger('merged_by')->nullable();
            $table->dateTime('reversed_at')->nullable();
            $table->unsignedBigInteger('reversed_by')->nullable();
            $table->timestamps();

            $table->foreign('keeper_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->foreign('duplicate_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->foreign('merged_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('reversed_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['duplicate_id', 'reversed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resident_merges');
    }
};
