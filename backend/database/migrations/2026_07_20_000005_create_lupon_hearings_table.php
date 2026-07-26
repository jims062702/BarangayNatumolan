<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lupon_hearings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('lupon_case_id');
            $table->enum('hearing_type', ['Mediation', 'Conciliation', 'Arbitration'])->default('Mediation');
            $table->dateTime('scheduled_at');
            $table->enum('status', ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled', 'No Show'])->default('Scheduled');
            $table->boolean('summons_issued')->default(false);
            $table->date('summons_served_date')->nullable();
            $table->boolean('complainant_present')->nullable();
            $table->boolean('respondent_present')->nullable();
            $table->text('attendance_notes')->nullable();
            $table->text('proceedings_notes')->nullable();
            $table->string('outcome')->nullable();
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('lupon_case_id')->references('id')->on('lupon_cases')->onDelete('cascade');
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('set null');
            $table->index('scheduled_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lupon_hearings');
    }
};
