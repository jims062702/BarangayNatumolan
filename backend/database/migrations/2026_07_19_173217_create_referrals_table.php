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
        Schema::create('referrals', function (Blueprint $table) {
            $table->id();
            $table->string('referral_number')->unique();
            $table->unsignedBigInteger('service_request_id')->nullable();
            $table->unsignedBigInteger('resident_id');
            $table->string('referring_office');
            $table->enum('receiving_office', ['PNP WCPD', 'DSWD', 'Rural Health Unit', 'Hospital', 'Prosecutor', 'Public Attorney', 'Shelter', 'Counseling', 'Child Protection', 'Lupon', 'Other']);
            $table->text('referral_reason');
            $table->text('required_information')->nullable();
            $table->date('referral_date');
            $table->date('acknowledgment_date')->nullable();
            $table->text('services_provided')->nullable();
            $table->text('referral_outcome')->nullable();
            $table->date('followup_date')->nullable();
            $table->enum('status', ['Pending', 'Acknowledged', 'In Progress', 'Completed', 'Not Attended'])->default('Pending');
            $table->timestamps();
            
            $table->foreign('service_request_id')->references('id')->on('service_requests')->onDelete('set null');
            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('cascade');
            $table->index('referral_number');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('referrals');
    }
};
