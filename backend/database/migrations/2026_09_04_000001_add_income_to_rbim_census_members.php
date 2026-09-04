<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Q15 — the household member's average monthly income.
 *
 * Left out at first on the reasoning that this system holds no money. That
 * reasoning was about the wrong money: the barangay's own funds — fees,
 * budgets, collections — are genuinely not modelled here and should not be.
 *
 * This is a different thing entirely. It is a census answer ABOUT a
 * resident, the same kind of fact as their education or their occupation,
 * and it is what an indigency certificate and a 4Ps list are actually
 * decided on. A census that cannot say who earns what cannot support the
 * programmes it exists to plan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            /*
             * Nullable and unsigned. The form says: if none, write 0 and skip
             * to Q19 — so zero is a real answer meaning "no income", and null
             * means nobody asked. They are different and the register has to
             * keep them apart.
             */
            $table->decimal('q15_monthly_income', 12, 2)->unsigned()->nullable()
                ->after('q14_school_place');
        });
    }

    public function down(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->dropColumn('q15_monthly_income');
        });
    }
};
