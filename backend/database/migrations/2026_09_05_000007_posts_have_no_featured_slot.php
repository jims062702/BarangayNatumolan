<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The featured slot goes.
 *
 * It was one post held above the rest, chosen by the office. In practice the
 * barangay has a handful of posts at a time, and lifting one of them out of
 * the list left a large card at the top and a thin grid under it — the same
 * information, arranged so that less of it fits on a screen.
 *
 * Ordering already does the job it was there for: `sort_order` puts whatever
 * matters most first, and the chips let a resident jump straight to the kind
 * they came for. A column nothing reads is a trap for whoever comes next, so
 * it is removed rather than left switched off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn('is_featured');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->boolean('is_featured')->default(false)->after('status');
        });
    }
};
