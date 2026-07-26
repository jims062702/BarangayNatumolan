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
        Schema::create('vawc_referrals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vawc_case_id');
            $table->enum('referral_agency', ['PNP WCPD', 'DSWD', 'Rural Health Unit', 'Hospital', 'Prosecutor', 'Public Attorney', 'Shelter', 'Counseling Service', 'Child Protection', 'Other'])->default('DSWD');
            $table->string('receiving_person')->nullable();
            $table->text('services_requested');
            $table->date('referral_date');
            $table->date('acknowledgment_date')->nullable();
            $table->text('outcome')->nullable();
            $table->date('followup_schedule')->nullable();
            $table->boolean('is_completed')->default(false);
            $table->timestamps();
            
            $table->foreign('vawc_case_id')->references('id')->on('vawc_cases')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vawc_referrals');
    }
};
