<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cdc_attendance', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('cdc_enrollment_id');
            $table->date('attendance_date');
            $table->enum('status', ['Present', 'Absent', 'Excused'])->default('Present');
            $table->string('remarks')->nullable();
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('cdc_enrollment_id')->references('id')->on('cdc_enrollments')->onDelete('cascade');
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('set null');
            $table->unique(['cdc_enrollment_id', 'attendance_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cdc_attendance');
    }
};
