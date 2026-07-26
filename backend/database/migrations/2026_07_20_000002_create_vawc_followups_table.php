<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vawc_followups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vawc_case_id');
            $table->date('followup_date');
            $table->enum('followup_type', ['Home Visit', 'Office Visit', 'Phone Call'])->default('Office Visit');
            $table->enum('safety_status', ['Safe', 'At Risk', 'Critical', 'Unknown'])->default('Unknown');
            $table->enum('bpo_compliance', ['Compliant', 'Violated', 'No BPO'])->default('No BPO');
            $table->boolean('referral_attended')->nullable();
            $table->text('services_received')->nullable();
            $table->text('notes')->nullable();
            $table->date('next_followup_date')->nullable();
            $table->boolean('closure_recommended')->default(false);
            $table->unsignedBigInteger('recorded_by');
            $table->timestamps();

            $table->foreign('vawc_case_id')->references('id')->on('vawc_cases')->onDelete('cascade');
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('restrict');
            $table->index('followup_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vawc_followups');
    }
};
