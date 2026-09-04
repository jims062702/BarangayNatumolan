<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two facts the intake could not hold:
 *
 * 1. WHO REPORTED IT. A VAWC complaint is very often brought by someone other
 *    than the survivor — a neighbour, a relative, a barangay official. That
 *    person need not be a resident; only the survivor must be, since that is
 *    what places the case with this barangay. Blank means the survivor
 *    reported it herself.
 *
 * 2. WHICH DEPENDENTS. The case recorded only a COUNT of children involved,
 *    which is useless when coordinating protective services — the desk needs
 *    to know who they are, their ages, and where they are staying.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vawc_cases', function (Blueprint $table) {
            $table->string('reported_by_name')->nullable()->after('survivor_id');
            $table->string('reported_by_relationship')->nullable()->after('reported_by_name');
            $table->string('reported_by_contact')->nullable()->after('reported_by_relationship');
            // Encrypted at rest like every other narrative field on this table.
            $table->text('children_details')->nullable()->after('children_count');
        });
    }

    public function down(): void
    {
        Schema::table('vawc_cases', function (Blueprint $table) {
            $table->dropColumn([
                'reported_by_name',
                'reported_by_relationship',
                'reported_by_contact',
                'children_details',
            ]);
        });
    }
};
