<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Duplicate residents are inevitable in a barangay register: namesakes, house
 * visits that re-list someone already on file, and nickname spellings ("James"
 * one year, "Jims" the next). Until now the only remedy was to deactivate one
 * copy, which left its certificates, family links and portal account stranded
 * on a record nobody looks at.
 *
 * A merged record is kept rather than deleted — certificates issued under its
 * number must stay verifiable — and points at the record that absorbed it, so
 * anything still holding the old id can be sent to the right person.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->unsignedBigInteger('merged_into_id')->nullable()->after('is_active');
            $table->foreign('merged_into_id')->references('id')->on('residents')->nullOnDelete();
            $table->index('merged_into_id');
        });
    }

    public function down(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->dropForeign(['merged_into_id']);
            $table->dropIndex(['merged_into_id']);
            $table->dropColumn('merged_into_id');
        });
    }
};
