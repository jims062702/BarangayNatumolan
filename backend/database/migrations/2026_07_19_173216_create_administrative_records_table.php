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
        Schema::create('administrative_records', function (Blueprint $table) {
            $table->id();
            $table->enum('document_type', ['Ordinance', 'Resolution', 'Executive Order', 'Memorandum', 'Meeting Minutes', 'Committee Report', 'Correspondence', 'Contract', 'Agreement', 'Barangay Assembly Record', 'Other']);
            $table->string('document_number')->unique();
            $table->string('document_title');
            $table->date('document_date');
            $table->text('document_content');
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->boolean('is_archived')->default(false);
            $table->string('file_reference')->nullable();
            $table->text('summary')->nullable();
            $table->timestamps();
            
            $table->foreign('created_by')->references('id')->on('users')->onDelete('restrict');
            $table->foreign('approved_by')->references('id')->on('users')->onDelete('set null');
            $table->index('document_type');
            $table->index('document_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('administrative_records');
    }
};
