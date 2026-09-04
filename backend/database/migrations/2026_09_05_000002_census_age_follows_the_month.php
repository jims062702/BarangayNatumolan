<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The census asks for a birth month and year, and nothing more.
 *
 * A day-of-birth box was added so the register could store a full date. The
 * office is right that it does not belong there: it is not on the paper form,
 * the BHW never collected it, and a box nobody can answer from the sheet in
 * front of them gets filled with a guess.
 *
 * So the date is derived instead — the last day of the birth month — which
 * makes age turn over at the end of that month. Somebody born in June is 32
 * for all of June and 33 in July, which is the safe direction to be wrong in:
 * it never claims somebody is older than they are.
 *
 * That derived date is a month's worth of approximation, and a record that
 * cannot say so would be lying quietly. `birthdate_is_estimated` says so, and
 * is what a clerk should see before using one on anything that matters.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->dropColumn('birth_day');
        });

        Schema::table('residents', function (Blueprint $table) {
            $table->boolean('birthdate_is_estimated')->default(false)->after('birthdate');
        });

        Schema::table('rbim_census_members', function (Blueprint $table) {
            /*
             * Whether this line should become a resident record.
             *
             * Line 1 is the household head and is always registered — a
             * household with nobody in it is not a household. The rest are on
             * by default and can be turned off: a census records who was
             * there that evening, and a visiting cousin from the next
             * barangay is a line on the sheet without being somebody this
             * barangay registers.
             */
            $table->boolean('register_as_resident')->default(true)->after('resident_id');
        });
    }

    public function down(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->dropColumn('register_as_resident');
            $table->unsignedTinyInteger('birth_day')->nullable()->after('q5_birth_year');
        });

        Schema::table('residents', function (Blueprint $table) {
            $table->dropColumn('birthdate_is_estimated');
        });
    }
};
