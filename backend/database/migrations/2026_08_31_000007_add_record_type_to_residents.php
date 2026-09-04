<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Not everyone on a family tree lives in the barangay.
 *
 * A resident's mother two towns over, or a spouse who has never moved here,
 * has to exist in the register — otherwise the family cannot be recorded at
 * all — but they are NOT a constituent. They get no portal account, they are
 * not counted in the population, and asking them for a purok, a residency
 * status or a length of residence is asking for something that does not
 * exist.
 *
 * So the row is marked for what it is, and the short form takes only what the
 * barangay actually needs to reach them: a name, a number, an address. If
 * they later move in, the record is converted rather than duplicated — their
 * whole family history comes with them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->string('record_type', 20)->default('Resident')->after('resident_number');
            // Where a non-resident lives, since they have no household here.
            // A bona fide resident's address comes from their household.
            $table->string('address')->nullable()->after('zone_purok');

            // Every registry list, count and sector report filters on this.
            $table->index(['record_type', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->dropIndex(['record_type', 'is_active']);
            $table->dropColumn(['record_type', 'address']);
        });
    }
};
