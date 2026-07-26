<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add the portal "Resident" role/office to the enums (MySQL).
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('Punong Barangay','Secretary','Clerk','VAWC Officer','Lupon Secretary','Population Worker','Health Personnel','Child Development Worker','Admin','Resident') NOT NULL DEFAULT 'Clerk'");
        DB::statement("ALTER TABLE users MODIFY COLUMN office ENUM('Main Office','VAWC','Lupon','Population','Health Station','CDC','Admin','Resident') NOT NULL DEFAULT 'Main Office'");

        Schema::table('users', function (Blueprint $table) {
            // Portal accounts are linked 1:1 to a resident record and are
            // created only by the Population Office (BPO).
            $table->unsignedBigInteger('resident_id')->nullable()->unique()->after('is_active');
            $table->unsignedBigInteger('created_by')->nullable()->after('resident_id');

            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('set null');
            $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['resident_id']);
            $table->dropForeign(['created_by']);
            $table->dropColumn(['resident_id', 'created_by']);
        });

        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('Punong Barangay','Secretary','Clerk','VAWC Officer','Lupon Secretary','Population Worker','Health Personnel','Child Development Worker','Admin') NOT NULL DEFAULT 'Clerk'");
        DB::statement("ALTER TABLE users MODIFY COLUMN office ENUM('Main Office','VAWC','Lupon','Population','Health Station','CDC','Admin') NOT NULL DEFAULT 'Main Office'");
    }
};
