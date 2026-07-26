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
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['Punong Barangay', 'Secretary', 'Clerk', 'VAWC Officer', 'Lupon Secretary', 'Population Worker', 'Health Personnel', 'Child Development Worker', 'Admin'])->default('Clerk')->after('email');
            $table->enum('office', ['Main Office', 'VAWC', 'Lupon', 'Population', 'Health Station', 'CDC', 'Admin'])->default('Main Office')->after('role');
            $table->boolean('is_active')->default(true)->after('office');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'office', 'is_active']);
        });
    }
};
