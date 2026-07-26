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
        Schema::create('residents', function (Blueprint $table) {
            $table->id();
            $table->string('resident_number')->unique();
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('suffix')->nullable();
            $table->enum('gender', ['Male', 'Female', 'Other'])->nullable();
            $table->date('birthdate')->nullable();
            $table->string('civil_status')->nullable();
            $table->string('occupation')->nullable();
            $table->string('contact_number')->nullable();
            $table->string('email')->nullable();
            $table->unsignedBigInteger('household_id')->nullable();
            $table->enum('residency_status', ['Permanent', 'Temporary', 'Migrant'])->default('Permanent');
            $table->integer('length_of_residence_years')->nullable();
            $table->string('zone_purok')->nullable();
            $table->string('educational_attainment')->nullable();
            $table->enum('demographic_classification', ['Senior Citizen', 'PWD', 'Solo Parent', 'Youth', 'Child', 'Others'])->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('remarks')->nullable();
            $table->timestamps();
            
            $table->foreign('household_id')->references('id')->on('households')->onDelete('set null');
            $table->index('resident_number');
            $table->index('household_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('residents');
    }
};
