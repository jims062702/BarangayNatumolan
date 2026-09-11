<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What each councillor is responsible for.
 *
 * The barangay's clearance form lists it under every name in the sidebar —
 * "Committee on Health and Sanitation, Committee on Social Services" —
 * because that is what the panel is FOR: a resident reading the sheet can
 * see who to ask about what. The roster had only a position, so the printed
 * sidebar said "Barangay Kagawad" seven times in a row and told nobody
 * anything.
 *
 * One text column, not a committees table. A councillor's committees are a
 * line of prose on a form, they change with each assignment, and nothing in
 * the system needs to search or count them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('officials', function (Blueprint $table) {
            $table->string('committees', 300)->nullable()->after('position');
        });
    }

    public function down(): void
    {
        Schema::table('officials', function (Blueprint $table) {
            $table->dropColumn('committees');
        });
    }
};
