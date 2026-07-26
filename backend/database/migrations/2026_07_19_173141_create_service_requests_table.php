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
        Schema::create('service_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_number')->unique();
            $table->unsignedBigInteger('resident_id')->nullable();
            $table->string('service_type');
            $table->string('office');
            $table->enum('request_type', ['Walk-in', 'Online'])->default('Walk-in');
            $table->enum('status', ['Pending', 'In Progress', 'Approved', 'Completed', 'Rejected'])->default('Pending');
            $table->text('purpose')->nullable();
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->timestamps();
            
            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('set null');
            $table->foreign('assigned_to')->references('id')->on('users')->onDelete('set null');
            $table->index('request_number');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('service_requests');
    }
};
