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
        Schema::create('vawc_incidents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vawc_case_id');
            $table->text('incident_narrative');
            $table->text('injury_documentation')->nullable();
            $table->string('medical_certificate_reference')->nullable();
            $table->string('police_report_reference')->nullable();
            $table->boolean('protection_order_filed')->default(false);
            $table->text('attachments_notes')->nullable();
            $table->dateTime('document_access_log')->nullable();
            $table->boolean('is_confidential')->default(true);
            $table->timestamps();
            
            $table->foreign('vawc_case_id')->references('id')->on('vawc_cases')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vawc_incidents');
    }
};
