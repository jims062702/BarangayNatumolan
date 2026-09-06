<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The session record the barangay secretary is required to keep.
 *
 * Under the Local Government Code the secretary keeps the minutes of every
 * Sangguniang Barangay session and the record of who attended it. Until now
 * this system had nowhere to put either, so the one document a secretary is
 * personally answerable for lived outside it.
 *
 * Attendance is its own table rather than a list on the session, because the
 * question asked of it is "was this kagawad present" — per official, per
 * session — and a name buried in a text field cannot answer that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('barangay_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('session_number')->unique();

            /*
             * Regular sessions are the calendar ones; a special session is
             * called for a particular matter. Which it was changes what a
             * quorum means, so it is a field and not a note.
             */
            $table->enum('session_type', ['Regular', 'Special'])->default('Regular');

            $table->date('session_date');

            /*
             * Called to order and adjourned.
             *
             * Times, not a duration: the minutes record both, and a session
             * that ran from 9:05 to 11:40 is a different record from one that
             * "lasted two and a half hours".
             */
            $table->time('called_to_order_at')->nullable();
            $table->time('adjourned_at')->nullable();

            $table->string('venue')->default('Barangay Hall');

            $table->text('agenda')->nullable();

            /* The minutes themselves — the secretary's own document. */
            $table->longText('minutes')->nullable();

            /*
             * Draft until the secretary has finished writing, Adopted once
             * the council has approved the minutes at a later session. The
             * distinction matters: draft minutes are not yet a record.
             */
            $table->enum('status', ['Draft', 'For Approval', 'Adopted'])->default('Draft');

            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->dateTime('adopted_at')->nullable();

            $table->timestamps();

            $table->foreign('recorded_by')->references('id')->on('users')->nullOnDelete();
            $table->index('session_date');
            $table->index('status');
        });

        Schema::create('barangay_session_attendees', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('barangay_session_id');

            /*
             * Written as a name and a position rather than pointed at a user.
             * A kagawad is not necessarily a system account, and the minutes
             * of a session held in 2026 must still read correctly after that
             * person leaves office.
             */
            $table->string('name');
            $table->string('position')->nullable();

            $table->enum('attendance', ['Present', 'Absent', 'Excused', 'Late'])
                ->default('Present');

            $table->string('remarks')->nullable();

            $table->timestamps();

            $table->foreign('barangay_session_id')
                ->references('id')->on('barangay_sessions')->cascadeOnDelete();

            /* One row per person per session — a name recorded twice is an
               attendance count that cannot be trusted. */
            $table->unique(['barangay_session_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('barangay_session_attendees');
        Schema::dropIfExists('barangay_sessions');
    }
};
