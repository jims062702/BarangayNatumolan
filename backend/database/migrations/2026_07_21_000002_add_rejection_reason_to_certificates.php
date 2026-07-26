<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Lets the Punong Barangay record why an application was rejected. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->string('rejection_reason', 500)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->dropColumn('rejection_reason');
        });
    }
};
