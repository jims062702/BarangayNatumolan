<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Appointments can be booked without a linked service request (a resident
 * just picks a schedule), and a resident booking starts as "Pending" while
 * it awaits staff confirmation. Make service_request_id nullable and add the
 * Pending status to the enum.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE appointments MODIFY service_request_id BIGINT UNSIGNED NULL');
        DB::statement(
            "ALTER TABLE appointments MODIFY status "
            . "ENUM('Pending','Scheduled','Confirmed','Completed','Cancelled','No-show') "
            . "NOT NULL DEFAULT 'Scheduled'"
        );
    }

    public function down(): void
    {
        // Restore rows that used the new status before tightening the column.
        DB::table('appointments')->where('status', 'Pending')->update(['status' => 'Scheduled']);
        DB::statement(
            "ALTER TABLE appointments MODIFY status "
            . "ENUM('Scheduled','Confirmed','Completed','Cancelled','No-show') "
            . "NOT NULL DEFAULT 'Scheduled'"
        );
        DB::statement('ALTER TABLE appointments MODIFY service_request_id BIGINT UNSIGNED NOT NULL');
    }
};
