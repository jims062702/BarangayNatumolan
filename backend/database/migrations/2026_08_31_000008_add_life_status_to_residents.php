<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a resident is living, kept apart from whether their record is in use.
 *
 * `is_active` already existed, but it only ever meant "still on the active
 * register" — the same flag a duplicate or a mistaken entry gets switched off
 * with. It cannot tell the office that someone has PASSED AWAY, which is a
 * different fact with different consequences: their family links must stay
 * (they are still somebody's father), their portal login must not, and the
 * marriage they were in ends by death rather than by choice.
 *
 * So the reason gets its own column. Marking someone deceased still clears
 * `is_active`, which is what every population count already filters on, so
 * they leave the figures without a single query having to change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->string('life_status', 20)->default('Alive')->after('is_active');
            $table->date('date_of_death')->nullable()->after('life_status');
            // Why the office recorded it, and on whose word.
            $table->string('life_status_note', 255)->nullable()->after('date_of_death');

            $table->index('life_status');
        });
    }

    public function down(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->dropIndex(['life_status']);
            $table->dropColumn(['life_status', 'date_of_death', 'life_status_note']);
        });
    }
};
