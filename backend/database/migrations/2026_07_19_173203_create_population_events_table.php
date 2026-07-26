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
        Schema::create('population_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('resident_id')->nullable();
            $table->enum('event_type', ['Birth', 'Death', 'Transfer In', 'Transfer Out', 'Address Change', 'Household Change', 'Residency Status Change'])->default('Birth');
            $table->date('event_date');
            $table->text('description')->nullable();
            $table->string('verification_status')->default('Pending');
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->text('verification_notes')->nullable();
            $table->timestamps();
            
            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('set null');
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('set null');
            $table->index('event_type');
            $table->index('event_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('population_events');
    }
};
