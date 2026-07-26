<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            // Optional image for the landing "News & Announcement" cards.
            $table->string('image_path')->nullable()->after('event_at');
            $table->string('event_time')->nullable()->after('image_path');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn(['image_path', 'event_time']);
        });
    }
};
