<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Barangay + SK officials shown on the public landing page,
        // managed by the SK office.
        Schema::create('officials', function (Blueprint $table) {
            $table->id();
            $table->enum('group', ['Barangay', 'SK'])->default('Barangay');
            $table->string('position');
            $table->string('name');
            $table->string('term')->nullable();
            $table->string('photo_path')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['group', 'is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('officials');
    }
};
