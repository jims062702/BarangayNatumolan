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
        Schema::create('lupon_complaints', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('lupon_case_id');
            $table->text('complaint_narrative');
            $table->date('date_of_occurrence');
            $table->string('place_of_occurrence');
            $table->enum('residency_verified', ['Both Resident', 'Partial', 'Not Resident'])->default('Both Resident');
            $table->enum('relationship_nature', ['Family', 'Neighbor', 'Business', 'Friend', 'Other']);
            $table->boolean('has_previous_settlement')->default(false);
            $table->text('previous_settlement_notes')->nullable();
            $table->date('complaint_received_date');
            $table->timestamps();
            
            $table->foreign('lupon_case_id')->references('id')->on('lupon_cases')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lupon_complaints');
    }
};
