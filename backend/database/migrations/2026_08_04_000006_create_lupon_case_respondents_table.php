<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * A KP complaint may name more than one respondent — being assaulted by two
 * people is one dispute, not two cases, and recording only one of them
 * misstates who is bound by the settlement.
 *
 * Existing single respondents are copied into the pivot before the column is
 * dropped, so no case loses its party.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lupon_case_respondents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('lupon_case_id');
            $table->unsignedBigInteger('resident_id');
            $table->timestamps();

            $table->foreign('lupon_case_id')->references('id')->on('lupon_cases')->onDelete('cascade');
            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('cascade');
            $table->unique(['lupon_case_id', 'resident_id']);
        });

        // Carry every existing respondent across.
        DB::table('lupon_cases')
            ->whereNotNull('respondent_id')
            ->orderBy('id')
            ->chunk(200, function ($cases) {
                $rows = $cases->map(fn ($c) => [
                    'lupon_case_id' => $c->id,
                    'resident_id' => $c->respondent_id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ])->all();

                if ($rows) {
                    DB::table('lupon_case_respondents')->insert($rows);
                }
            });

        Schema::table('lupon_cases', function (Blueprint $table) {
            $table->dropForeign(['respondent_id']);
            $table->dropColumn('respondent_id');
        });
    }

    public function down(): void
    {
        Schema::table('lupon_cases', function (Blueprint $table) {
            $table->unsignedBigInteger('respondent_id')->nullable()->after('complainant_contact');
            $table->foreign('respondent_id')->references('id')->on('residents')->onDelete('cascade');
        });

        // Restore the first respondent of each case into the old column.
        foreach (DB::table('lupon_case_respondents')->orderBy('id')->get() as $row) {
            DB::table('lupon_cases')
                ->where('id', $row->lupon_case_id)
                ->whereNull('respondent_id')
                ->update(['respondent_id' => $row->resident_id]);
        }

        Schema::dropIfExists('lupon_case_respondents');
    }
};
