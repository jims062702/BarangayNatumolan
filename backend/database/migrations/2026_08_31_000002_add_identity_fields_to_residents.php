<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The fields that tell two people apart when their name and birthday cannot.
 *
 * Same first name, same last name, same birthday is rare but real, and no
 * amount of cleverer matching resolves it: once those three agree, the record
 * holds nothing else to go on. The way out is to capture something that is
 * distinct by nature, and in the Philippines that is the MOTHER'S MAIDEN NAME
 * — it is on the PSA birth certificate, it is asked on every government form,
 * and two unrelated people with the same name and birthday essentially never
 * share it.
 *
 * It also repairs the case that has no answer otherwise: a resident with no
 * middle name recorded. The Filipino middle name IS the mother's maiden
 * surname, so asking for it recovers exactly the field that was missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->string('mother_maiden_name')->nullable()->after('middle_name');
            $table->string('birth_place')->nullable()->after('birthdate');

            // Both are read on every duplicate check, against the whole registry.
            $table->index(['last_name', 'birthdate']);
        });
    }

    public function down(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->dropIndex(['last_name', 'birthdate']);
            $table->dropColumn(['mother_maiden_name', 'birth_place']);
        });
    }
};
