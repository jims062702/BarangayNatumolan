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
        Schema::create('lupon_cases', function (Blueprint $table) {
            $table->id();
            $table->string('case_number')->unique();
            $table->string('case_title');
            $table->enum('case_classification', ['Assault', 'Theft', 'Property Damage', 'Libel', 'Ejectment', 'Debt', 'Family Dispute', 'Land Dispute', 'Others']);
            $table->unsignedBigInteger('complainant_id');
            $table->unsignedBigInteger('respondent_id');
            $table->enum('jurisdiction_status', ['Accepted', 'Rejected', 'Referred'])->default('Accepted');
            $table->string('rejection_reason')->nullable();
            $table->enum('current_stage', ['Filed', 'Mediation', 'Conciliation', 'Arbitration', 'Settled', 'Dismissed', 'Referred'])->default('Filed');
            $table->date('date_filed');
            $table->date('date_resolved')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('assigned_lupon_secretary')->nullable();
            $table->timestamps();
            
            $table->foreign('complainant_id')->references('id')->on('residents')->onDelete('cascade');
            $table->foreign('respondent_id')->references('id')->on('residents')->onDelete('cascade');
            $table->foreign('assigned_lupon_secretary')->references('id')->on('users')->onDelete('set null');
            $table->index('case_number');
            $table->index('current_stage');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lupon_cases');
    }
};
