<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('health_visits', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('patient_id');
            $table->date('visit_date');
            $table->string('visit_reason');
            $table->decimal('temperature', 5, 2)->nullable();
            $table->string('blood_pressure')->nullable();
            $table->integer('heart_rate')->nullable();
            $table->text('symptoms')->nullable();
            $table->text('observations')->nullable();
            $table->unsignedBigInteger('service_provider_id');
            $table->text('consultation_notes')->nullable();
            $table->text('treatment_advice')->nullable();
            $table->date('followup_schedule')->nullable();
            $table->boolean('referral_recommended')->default(false);
            $table->string('referral_destination')->nullable();
            $table->timestamps();
            
            $table->foreign('patient_id')->references('id')->on('residents')->onDelete('cascade');
            $table->foreign('service_provider_id')->references('id')->on('users')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('health_visits');
    }
};
