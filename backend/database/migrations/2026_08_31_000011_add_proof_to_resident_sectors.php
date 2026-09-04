<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Evidence behind a sector tag.
 *
 * Some sectors are a judgement the barangay makes — Indigent, Unemployed.
 * Others are a STATUS somebody holds under a law, granted by an office that
 * issues a card for it: Solo Parent under RA 8972, PWD under RA 10754. Those
 * carry benefits, and a tag with nothing behind it is how a benefit ends up
 * with someone who never qualified while the person who did goes without.
 *
 * So the card number, the date it was issued and the date it lapses are
 * recorded with the tag. For Solo Parent the reference is required outright:
 * being a solo parent is a registration, not something a clerk decides by
 * looking at a household.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('resident_sectors', function (Blueprint $table) {
            // The Solo Parent ID / PWD ID / 4Ps household number.
            $table->string('reference_no', 60)->nullable()->after('sector_type');
            $table->date('issued_on')->nullable()->after('reference_no');
            /*
             * A Solo Parent ID runs for one year and is renewed. Recording
             * the expiry is what lets the office see whose has lapsed instead
             * of carrying a stale list into the next distribution.
             */
            $table->date('valid_until')->nullable()->after('issued_on');
            $table->string('note', 255)->nullable()->after('valid_until');
        });
    }

    public function down(): void
    {
        Schema::table('resident_sectors', function (Blueprint $table) {
            $table->dropColumn(['reference_no', 'issued_on', 'valid_until', 'note']);
        });
    }
};
