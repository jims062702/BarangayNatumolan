<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Adds "Adult" (ages 31–59) to the resident classification options. */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE residents MODIFY demographic_classification "
            . "ENUM('Senior Citizen','PWD','Solo Parent','Youth','Child','Adult','Others') NULL"
        );
    }

    public function down(): void
    {
        DB::table('residents')->where('demographic_classification', 'Adult')->update(['demographic_classification' => null]);
        DB::statement(
            "ALTER TABLE residents MODIFY demographic_classification "
            . "ENUM('Senior Citizen','PWD','Solo Parent','Youth','Child','Others') NULL"
        );
    }
};
