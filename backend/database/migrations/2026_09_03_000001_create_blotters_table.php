<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The barangay blotter — the record of incidents reported at the desk.
 *
 * Everything else in this system is a PROCESS: a KP case moves through
 * mediation, a certificate through printing, a VAWC case through follow-ups.
 * A blotter is not. It is the first thing written down, often before anybody
 * knows what it will become, and its whole value is that it was written at
 * the time by the person on duty.
 *
 * So it is deliberately flat: what happened, where, who was there, and what
 * the barangay did about it. Where it goes next — the Lupon, the PNP, another
 * agency — is recorded as an ACTION rather than by turning the blotter into
 * something else, because the entry has to stay readable as what was said on
 * the day.
 *
 * A blotter about violence against women or children is NOT recorded here.
 * See BlotterController: it is refused and routed to the VAWC desk, whose
 * records are confidential and whose narratives must never sit in a book the
 * whole Main Office can read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blotters', function (Blueprint $table) {
            $table->id();
            $table->string('blotter_number', 32)->unique();

            /*
             * When it was WRITTEN DOWN, which is not when it happened. A
             * report made three days later is a different thing from one made
             * the same night, and the gap is often the point.
             */
            $table->dateTime('recorded_at');
            $table->unsignedBigInteger('recorded_by')->nullable();

            // The incident itself.
            $table->dateTime('incident_at')->nullable();
            $table->string('place_of_incident', 255);
            $table->enum('incident_type', [
                'Physical Altercation', 'Verbal Abuse or Threat', 'Theft', 'Property Damage',
                'Noise or Disturbance', 'Trespassing', 'Missing Person', 'Accident',
                'Animal Complaint', 'Drug-related', 'Other',
            ])->default('Other');
            $table->text('narrative');

            /*
             * Who reported it. A registry link where they are one of ours, a
             * typed name where they are not — anybody may report an incident
             * to the barangay, whoever they are.
             */
            $table->unsignedBigInteger('reporter_id')->nullable();
            $table->string('reporter_name', 150)->nullable();
            $table->string('reporter_address', 255)->nullable();
            $table->string('reporter_contact', 50)->nullable();

            /*
             * What the barangay did. This is the field the blotter exists for:
             * an incident with no recorded action is the complaint everybody
             * remembers differently a year later.
             */
            $table->enum('action_taken', [
                'Recorded only', 'Advised the parties', 'Settled at the desk',
                'Referred to Lupon', 'Referred to PNP', 'Referred to other agency',
                'For monitoring',
            ])->default('Recorded only');
            $table->text('action_notes')->nullable();

            $table->enum('status', ['Open', 'Closed'])->default('Open');
            $table->dateTime('closed_at')->nullable();

            // Set when the blotter became a KP case, so the two are traceable.
            $table->unsignedBigInteger('lupon_case_id')->nullable();

            $table->timestamps();

            $table->foreign('recorded_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('reporter_id')->references('id')->on('residents')->nullOnDelete();
            $table->foreign('lupon_case_id')->references('id')->on('lupon_cases')->nullOnDelete();
            $table->index(['status', 'recorded_at']);
            $table->index('incident_type');
        });

        /*
         * Everybody else named in the entry, in one table.
         *
         * A subject and a witness are the same kind of row — a person, who may
         * or may not be on the register — and splitting them into two tables
         * would double every query for no gain. The role says which.
         */
        Schema::create('blotter_people', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('blotter_id');
            $table->enum('role', ['Subject', 'Witness'])->default('Subject');
            $table->unsignedBigInteger('resident_id')->nullable();
            $table->string('name', 150)->nullable();
            $table->string('address', 255)->nullable();
            $table->string('contact', 50)->nullable();
            $table->timestamps();

            $table->foreign('blotter_id')->references('id')->on('blotters')->cascadeOnDelete();
            $table->foreign('resident_id')->references('id')->on('residents')->nullOnDelete();
            $table->index(['blotter_id', 'role']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blotter_people');
        Schema::dropIfExists('blotters');
    }
};
