<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vawc_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vawc_case_id');
            $table->enum('document_type', ['Affidavit', 'Statement', 'Medical Certificate', 'Police Report', 'Photograph', 'Protection Order', 'Other'])->default('Other');
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('file_reference')->nullable();
            $table->unsignedBigInteger('uploaded_by');
            $table->timestamps();

            $table->foreign('vawc_case_id')->references('id')->on('vawc_cases')->onDelete('cascade');
            $table->foreign('uploaded_by')->references('id')->on('users')->onDelete('restrict');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vawc_documents');
    }
};
