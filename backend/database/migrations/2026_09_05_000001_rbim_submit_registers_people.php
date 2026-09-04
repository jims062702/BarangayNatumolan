<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The census stops being a filing cabinet.
 *
 * Two states now, not three: a form is being typed (Draft), or it has been
 * submitted and its people are on the register (Submitted). The middle state
 * existed for a hand-over between two offices that does not happen inside
 * this system — the BHW carries PAPER to the Population Office, and by the
 * time anybody is at a keyboard it is already the Population Office's form.
 *
 * Submitting now registers the household. That needs two things a census
 * does not ask for, so they are asked for here:
 *
 *   birth_day   Q5 records a month and a year. The register stores a date.
 *               Without the day, submitting would either refuse every line or
 *               invent a birthday — and an invented birthday on a permanent
 *               record is worse than an extra box on a form.
 *   zone_purok  Every resident record carries one, and the paper form has
 *               nowhere to put it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->unsignedTinyInteger('birth_day')->nullable()->after('q5_birth_year');
        });

        Schema::table('rbim_censuses', function (Blueprint $table) {
            $table->string('zone_purok', 100)->nullable()->after('barangay');
        });

        /*
         * Anything already reviewed HAS been through the office line by line
         * — that is more work than a submission, not less — so it lands on
         * the surviving end state rather than being sent back to Draft.
         */
        DB::table('rbim_censuses')->where('status', 'Reviewed')->update(['status' => 'Submitted']);

        DB::statement(
            "ALTER TABLE rbim_censuses MODIFY COLUMN status ENUM('Draft','Submitted') NOT NULL DEFAULT 'Draft'"
        );
    }

    public function down(): void
    {
        DB::statement(
            "ALTER TABLE rbim_censuses MODIFY COLUMN status ENUM('Draft','Submitted','Reviewed') NOT NULL DEFAULT 'Draft'"
        );

        Schema::table('rbim_censuses', function (Blueprint $table) {
            $table->dropColumn('zone_purok');
        });

        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->dropColumn('birth_day');
        });
    }
};
