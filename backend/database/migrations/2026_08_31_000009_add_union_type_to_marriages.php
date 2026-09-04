<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Not every couple on the register is married.
 *
 * Live-in partners are ordinary in a barangay, and until now the system had
 * no way to say so: recording them at all meant calling them married, which
 * is wrong on the record AND wrong in law — it set both their civil statuses
 * to Married when they are legally single.
 *
 * The consequence that actually matters is their CHILDREN. The rule that a
 * child added to one parent is also the other's keyed off marriage, so
 * unmarried partners had to enter every child twice, once each. A union is a
 * union for that purpose whether or not there was a wedding.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('resident_marriages', function (Blueprint $table) {
            $table->string('union_type', 20)->default('Married')->after('spouse_id');
        });
    }

    public function down(): void
    {
        Schema::table('resident_marriages', function (Blueprint $table) {
            $table->dropColumn('union_type');
        });
    }
};
