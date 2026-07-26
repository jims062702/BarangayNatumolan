<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Replace the Child Development Center (CDC) office with the
 * Sangguniang Kabataan (SK) office. Additive & data-preserving:
 * only CDC seed data is removed.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Remove CDC subsystem tables (safe: FKs live inside these tables).
        Schema::dropIfExists('cdc_attendance');
        Schema::dropIfExists('cdc_enrollments');

        // Remove CDC staff accounts (seed-only) before narrowing the enums.
        DB::table('users')
            ->where('office', 'CDC')
            ->orWhere('role', 'Child Development Worker')
            ->delete();

        // Swap CDC → SK in both enums (add SK roles).
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('Punong Barangay','Secretary','Clerk','VAWC Officer','Lupon Secretary','Population Worker','Health Personnel','SK Chairperson','SK Kagawad','SK Secretary','Admin','Resident') NOT NULL DEFAULT 'Clerk'");
        DB::statement("ALTER TABLE users MODIFY COLUMN office ENUM('Main Office','VAWC','Lupon','Population','Health Station','SK','Admin','Resident') NOT NULL DEFAULT 'Main Office'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('Punong Barangay','Secretary','Clerk','VAWC Officer','Lupon Secretary','Population Worker','Health Personnel','Child Development Worker','Admin','Resident') NOT NULL DEFAULT 'Clerk'");
        DB::statement("ALTER TABLE users MODIFY COLUMN office ENUM('Main Office','VAWC','Lupon','Population','Health Station','CDC','Admin','Resident') NOT NULL DEFAULT 'Main Office'");
    }
};
