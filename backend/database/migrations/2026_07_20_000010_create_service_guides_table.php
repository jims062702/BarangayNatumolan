<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Knowledge base for the AI-assisted resident inquiry module.
        // Searched by the /assistant/inquiry endpoint (rule-based for now).
        Schema::create('service_guides', function (Blueprint $table) {
            $table->id();
            $table->string('office');
            $table->string('service_name');
            $table->text('description');
            $table->text('requirements')->nullable();
            $table->string('fees')->nullable();
            $table->string('schedule')->nullable();
            $table->string('keywords')->nullable(); // extra match terms, comma-separated
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('office');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_guides');
    }
};
