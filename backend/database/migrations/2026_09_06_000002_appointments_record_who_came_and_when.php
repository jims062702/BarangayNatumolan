<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What actually happened at an appointment, as against what was booked.
 *
 * The table already carried `scheduled_datetime` and a status, which together
 * say what was PLANNED. Nothing said whether the person turned up, when the
 * meeting really started, or what was agreed — so an appointment marked
 * Completed and one marked Completed after the resident arrived an hour late
 * were the same record.
 *
 * The secretary sets these. Booking is the front desk's; the minute-taking
 * is the secretary's, which is the whole reason these columns are separate
 * from the ones the desk fills in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            /*
             * Whether the person came. Distinct from `status`, which tracks
             * the booking — an appointment can be Completed with the resident
             * absent, if the office did its part and nobody arrived.
             */
            $table->enum('attendance', ['Awaiting', 'Present', 'Absent', 'Late'])
                ->default('Awaiting')
                ->after('status');

            /*
             * When it really ran.
             *
             * Times on the day of `scheduled_datetime`, not full datetimes:
             * an appointment that starts on a different day is a different
             * appointment, and storing a date twice invites the two to
             * disagree.
             */
            $table->time('started_at')->nullable()->after('attendance');
            $table->time('ended_at')->nullable()->after('started_at');

            /* The secretary's record of what was discussed and agreed. */
            $table->text('minutes')->nullable()->after('ended_at');

            $table->unsignedBigInteger('minuted_by')->nullable()->after('minutes');
            $table->dateTime('minuted_at')->nullable()->after('minuted_by');

            $table->foreign('minuted_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropForeign(['minuted_by']);
            $table->dropColumn([
                'attendance', 'started_at', 'ended_at',
                'minutes', 'minuted_by', 'minuted_at',
            ]);
        });
    }
};
