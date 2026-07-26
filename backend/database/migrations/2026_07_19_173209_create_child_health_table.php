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
        Schema::create('child_health', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('child_id');
            $table->date('birth_date');
            $table->decimal('birth_weight', 5, 2)->nullable();
            $table->integer('fully_immunized_status')->default(0);
            $table->decimal('current_weight', 5, 2)->nullable();
            $table->decimal('current_height', 5, 2)->nullable();
            $table->string('nutritional_status')->nullable();
            $table->text('growth_monitoring_notes')->nullable();
            $table->boolean('vitamin_services_received')->default(false);
            $table->text('breastfeeding_status')->nullable();
            $table->text('feeding_counseling_notes')->nullable();
            $table->boolean('referral_needed')->default(false);
            $table->string('referral_destination')->nullable();
            $table->timestamps();
            
            $table->foreign('child_id')->references('id')->on('residents')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('child_health');
    }
};
