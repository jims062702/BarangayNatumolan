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
        Schema::create('office_queue', function (Blueprint $table) {
            $table->id();
            $table->string('queue_number')->unique();
            $table->unsignedBigInteger('service_request_id');
            $table->unsignedBigInteger('resident_id');
            $table->string('office');
            $table->enum('status', ['Waiting', 'Called', 'Serving', 'Completed', 'Absent'])->default('Waiting');
            $table->dateTime('queue_time');
            $table->dateTime('called_time')->nullable();
            $table->dateTime('served_time')->nullable();
            $table->dateTime('completed_time')->nullable();
            $table->integer('wait_time_minutes')->nullable();
            $table->unsignedBigInteger('served_by')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            
            $table->foreign('service_request_id')->references('id')->on('service_requests')->onDelete('cascade');
            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('cascade');
            $table->foreign('served_by')->references('id')->on('users')->onDelete('set null');
            $table->index('office');
            $table->index('status');
            $table->index('queue_time');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('office_queue');
    }
};
