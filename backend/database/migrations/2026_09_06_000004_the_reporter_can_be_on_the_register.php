<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The person who brought the complaint, linked rather than retyped.
 *
 * `reported_by_name` is free text, so a neighbour who is on the register was
 * recorded as a string — spelled however the clerk typed it that day. Nothing
 * connected the report to the record, so the desk could not see that the same
 * neighbour had brought three complaints, and a name entered twice with a
 * middle initial once was two different people.
 *
 * The text column STAYS. Not everyone who reports is on the register — a
 * passer-by, an official from another barangay, somebody who will not give
 * their name — and a form that can only accept registered people turns those
 * reports away.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vawc_cases', function (Blueprint $table) {
            /*
             * Points at `residents`, which holds non-residents too — the
             * register's `record_type` tells them apart. So a barangay
             * neighbour and a recorded non-resident are both linkable here,
             * and only somebody on neither list falls back to the name.
             */
            $table->unsignedBigInteger('reported_by_resident_id')
                ->nullable()
                ->after('reported_by_name');

            /*
             * Null on delete, not cascade. Deleting a resident record must
             * never delete a VAWC case — the case is the survivor's, not the
             * reporter's, and `reported_by_name` still carries who it was.
             */
            $table->foreign('reported_by_resident_id')
                ->references('id')->on('residents')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('vawc_cases', function (Blueprint $table) {
            $table->dropForeign(['reported_by_resident_id']);
            $table->dropColumn('reported_by_resident_id');
        });
    }
};
