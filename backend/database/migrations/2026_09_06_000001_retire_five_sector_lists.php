<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Five sector lists the barangay does not keep.
 *
 * Pregnant Women, Unemployed, Out-of-School Youth, Farmer / Fisherfolk and
 * Informal Worker were in the taxonomy because they appear on national forms,
 * not because this office maintains them. A list nobody updates is worse than
 * no list: it is consulted, it is wrong, and the person relying on it has no
 * way to know.
 *
 * The tags are deactivated rather than deleted. A row says a BHW once judged
 * that of somebody, and the day they made that judgement — deleting it would
 * quietly rewrite what the register was told. Everything that reads sectors
 * already filters on `is_active`, so a deactivated tag is off every list,
 * every count and every chart from the moment this runs.
 */
return new class extends Migration
{
    private const RETIRED = [
        'Pregnant Women',
        'Unemployed',
        'Out-of-School Youth',
        'Farmer / Fisherfolk',
        'Informal Worker',
    ];

    public function up(): void
    {
        DB::table('resident_sectors')
            ->whereIn('sector_type', self::RETIRED)
            ->where('is_active', true)
            ->update([
                'is_active' => false,
                'unenrolled_date' => now()->toDateString(),
                'updated_at' => now(),
            ]);
    }

    /**
     * Deliberately does nothing.
     *
     * Bringing them back would mean reactivating every row that was ever on
     * one of these lists, including the ones a BHW had already ended for
     * their own reasons — and there is nothing in the table that tells the
     * two apart after the fact. If the barangay decides to keep one of these
     * lists again, the tags are still there to be turned back on by hand.
     */
    public function down(): void
    {
        //
    }
};
