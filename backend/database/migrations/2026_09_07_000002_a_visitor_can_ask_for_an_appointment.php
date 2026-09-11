<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An appointment for somebody who is not on the register.
 *
 * Every appointment until now belonged to a resident_id, so the barangay could
 * only see people it had already registered. A non-resident — somebody living
 * elsewhere with business here, a relative settling an estate, a contractor —
 * had to be entered as a register record before they could be given a time,
 * which is a lot of paperwork for a half-hour meeting.
 *
 * The resident link stays and stays preferred: a resident booking through the
 * portal is still a resident, with their record behind it. The guest columns
 * are for the person the register has never heard of.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            /*
             * Nullable now. One of resident_id or guest_name is always set —
             * enforced in the controller, because the database cannot express
             * "one of these two" without a check constraint MySQL 5.7 ignores.
             */
            $table->unsignedBigInteger('resident_id')->nullable()->change();

            $table->string('guest_name')->nullable()->after('resident_id');

            /* Optional. Somebody without an email address is not somebody the
               barangay should turn away. */
            $table->string('guest_email')->nullable()->after('guest_name');

            /*
             * Required for a guest, which is the whole point: it is the only
             * way the office can reach them to move or confirm the time, and
             * there is no record to look it up in.
             */
            $table->string('guest_contact', 30)->nullable()->after('guest_email');

            /* What they are coming about, in their own words. */
            $table->string('purpose', 300)->nullable()->after('guest_contact');

            $table->index('guest_contact');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropIndex(['guest_contact']);
            $table->dropColumn(['guest_name', 'guest_email', 'guest_contact', 'purpose']);
            $table->unsignedBigInteger('resident_id')->nullable(false)->change();
        });
    }
};
