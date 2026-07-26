<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cdc_enrollments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('child_id');
            $table->string('school_year'); // e.g. "2026-2027"
            $table->date('enrollment_date');
            $table->string('guardian_name');
            $table->string('guardian_contact')->nullable();
            $table->enum('session', ['Morning', 'Afternoon'])->default('Morning');
            $table->enum('status', ['Enrolled', 'Completed', 'Dropped'])->default('Enrolled');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('enrolled_by')->nullable();
            $table->timestamps();

            $table->foreign('child_id')->references('id')->on('residents')->onDelete('cascade');
            $table->foreign('enrolled_by')->references('id')->on('users')->onDelete('set null');
            $table->unique(['child_id', 'school_year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cdc_enrollments');
    }
};
