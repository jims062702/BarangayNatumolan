<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An email address and a phone number for each person on the census.
 *
 * Neither is on the DILG paper form, and both are needed by the system the
 * paper is being typed into. A resident portal account is issued against an
 * email address — PortalAccount::provision refuses without one — so a
 * household entered entirely through a census would come out with nobody
 * able to sign in and nothing saying why.
 *
 * The alternative is worse: the office finishes the census, then reopens
 * every profile one at a time to add the address the BHW already wrote in
 * the margin. So the boxes are on the form, marked as the system's own
 * questions rather than the census's.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            /*
             * NOT unique here, deliberately.
             *
             * `residents.email` is unique and has to be — one login, one
             * person. A census is a transcript of what a household said,
             * and a household that gives one address for two people has
             * said something the form must be able to hold. The clash is
             * resolved when a line is matched to the register, where it can
             * be reported to somebody rather than rejected at a doorstep.
             */
            $table->string('email', 150)->nullable()->after('middle_name');
            $table->string('contact_number', 40)->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->dropColumn(['email', 'contact_number']);
        });
    }
};
