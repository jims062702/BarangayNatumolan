<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Katarungang Pambarangay venue follows where the RESPONDENT resides, so a
 * complainant from another barangay may lawfully file here against one of our
 * residents. The registry cannot hold that person, so the case carries their
 * details inline instead.
 *
 * `complainant_id` becomes nullable: it is set when the complainant is a
 * registered resident, and left null when the external fields are used. The
 * respondent stays required — that link is what founds our jurisdiction.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lupon_cases', function (Blueprint $table) {
            $table->unsignedBigInteger('complainant_id')->nullable()->change();
            $table->string('complainant_name')->nullable()->after('complainant_id');
            $table->string('complainant_address')->nullable()->after('complainant_name');
            $table->string('complainant_contact')->nullable()->after('complainant_address');
        });
    }

    public function down(): void
    {
        Schema::table('lupon_cases', function (Blueprint $table) {
            $table->dropColumn(['complainant_name', 'complainant_address', 'complainant_contact']);
            $table->unsignedBigInteger('complainant_id')->nullable(false)->change();
        });
    }
};
