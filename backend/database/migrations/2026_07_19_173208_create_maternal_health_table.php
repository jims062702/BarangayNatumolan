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
        Schema::create('maternal_health', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('mother_id');
            $table->date('pregnancy_registration_date');
            $table->date('expected_delivery_date')->nullable();
            $table->date('actual_delivery_date')->nullable();
            $table->integer('prenatal_visits_count')->default(0);
            $table->text('risk_indicators')->nullable();
            $table->boolean('post_natal_followup_required')->default(false);
            $table->text('family_planning_method')->nullable();
            $table->text('family_planning_counseling_notes')->nullable();
            $table->boolean('maternal_immunization_received')->default(false);
            $table->boolean('referral_to_hospital')->default(false);
            $table->string('referral_reason')->nullable();
            $table->enum('status', ['Active', 'Delivered', 'Closed'])->default('Active');
            $table->timestamps();
            
            $table->foreign('mother_id')->references('id')->on('residents')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('maternal_health');
    }
};
