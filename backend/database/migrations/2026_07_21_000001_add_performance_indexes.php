<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes for the columns the app searches/filters most, so lookups stay
 * fast as the registry grows toward 20k+ residents.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->index('last_name');
            $table->index('first_name');
            $table->index('zone_purok');
        });

        Schema::table('announcements', function (Blueprint $table) {
            $table->index(['is_published', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->dropIndex(['last_name']);
            $table->dropIndex(['first_name']);
            $table->dropIndex(['zone_purok']);
        });

        Schema::table('announcements', function (Blueprint $table) {
            $table->dropIndex(['is_published', 'sort_order']);
        });
    }
};
