<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * VAWC intake records "complaint date AND time" (module 2.1). The column was
 * date-only and always stamped with today, so a case encoded the morning after
 * a night-time report carried the wrong day and no hour at all — and the hour
 * matters when a Barangay Protection Order is being timed.
 *
 * Existing rows keep their date and fall at midnight.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vawc_cases', function (Blueprint $table) {
            $table->dateTime('report_date')->change();
        });
    }

    public function down(): void
    {
        Schema::table('vawc_cases', function (Blueprint $table) {
            $table->date('report_date')->change();
        });
    }
};
