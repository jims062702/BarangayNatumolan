<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Three places where the form held fewer answers than the paper allows.
 *
 * Q43 could be answered "Others" with nowhere to say what the other training
 * was — the code list had no Others at all, so the specify box beside it was
 * unreachable.
 *
 * Q54 to Q57 each held a FIXED number of answers: one female death, one child
 * death, three diseases, three needs. A household that lost two people in the
 * year had nowhere to write the second, and the census would record it as
 * having lost one. These become lists, and the rows already recorded are
 * carried into them rather than dropped.
 *
 * And Q15 was capped at eight digits by its column while the form now allows
 * twelve typed. A number the browser accepts and the database refuses is a
 * failed save with nothing to show for it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->string('q43_other', 120)->nullable()->after('q43_training_interest');
            $table->decimal('q15_monthly_income', 14, 2)->unsigned()->nullable()->change();
        });

        Schema::table('rbim_censuses', function (Blueprint $table) {
            $table->json('q54_female_deaths')->nullable()->after('q53_other');
            $table->json('q55_child_deaths')->nullable()->after('q54_female_deaths');
            $table->json('q56_common_diseases')->nullable()->after('q55_child_deaths');
            $table->json('q57_primary_needs')->nullable()->after('q56_common_diseases');
        });

        /*
         * Carry what is already recorded into the new lists. A form that
         * answered none of these keeps a null rather than an empty list, so
         * "nobody died" and "nobody asked" stay different answers.
         */
        foreach (DB::table('rbim_censuses')->get() as $row) {
            $female = [];
            if ($row->q54_female_death_age !== null || $row->q54_female_death_cause !== null) {
                $female[] = [
                    'age' => $row->q54_female_death_age,
                    'cause' => $row->q54_female_death_cause,
                ];
            }

            $child = [];
            if ($row->q55_child_death_age !== null
                || $row->q55_child_death_sex !== null
                || $row->q55_child_death_cause !== null) {
                $child[] = [
                    'age' => $row->q55_child_death_age,
                    'sex' => $row->q55_child_death_sex,
                    'cause' => $row->q55_child_death_cause,
                ];
            }

            $diseases = array_values(array_filter([
                $row->q56_common_disease_1, $row->q56_common_disease_2, $row->q56_common_disease_3,
            ], fn ($v) => $v !== null && $v !== ''));

            $needs = array_values(array_filter([
                $row->q57_primary_need_1, $row->q57_primary_need_2, $row->q57_primary_need_3,
            ], fn ($v) => $v !== null && $v !== ''));

            DB::table('rbim_censuses')->where('id', $row->id)->update([
                'q54_female_deaths' => $female ? json_encode($female) : null,
                'q55_child_deaths' => $child ? json_encode($child) : null,
                'q56_common_diseases' => $diseases ? json_encode($diseases) : null,
                'q57_primary_needs' => $needs ? json_encode($needs) : null,
            ]);
        }

        Schema::table('rbim_censuses', function (Blueprint $table) {
            $table->dropColumn([
                'q54_female_death_age', 'q54_female_death_cause',
                'q55_child_death_age', 'q55_child_death_sex', 'q55_child_death_cause',
                'q56_common_disease_1', 'q56_common_disease_2', 'q56_common_disease_3',
                'q57_primary_need_1', 'q57_primary_need_2', 'q57_primary_need_3',
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('rbim_censuses', function (Blueprint $table) {
            $table->unsignedTinyInteger('q54_female_death_age')->nullable();
            $table->string('q54_female_death_cause', 150)->nullable();
            $table->unsignedTinyInteger('q55_child_death_age')->nullable();
            $table->unsignedTinyInteger('q55_child_death_sex')->nullable();
            $table->string('q55_child_death_cause', 150)->nullable();
            $table->string('q56_common_disease_1', 120)->nullable();
            $table->string('q56_common_disease_2', 120)->nullable();
            $table->string('q56_common_disease_3', 120)->nullable();
            $table->string('q57_primary_need_1', 120)->nullable();
            $table->string('q57_primary_need_2', 120)->nullable();
            $table->string('q57_primary_need_3', 120)->nullable();
        });

        /* Only the first of each list survives going back — that is what the
         * old shape can hold, and it is the reason the shape changed. */
        foreach (DB::table('rbim_censuses')->get() as $row) {
            $female = json_decode((string) $row->q54_female_deaths, true) ?: [];
            $child = json_decode((string) $row->q55_child_deaths, true) ?: [];
            $diseases = json_decode((string) $row->q56_common_diseases, true) ?: [];
            $needs = json_decode((string) $row->q57_primary_needs, true) ?: [];

            DB::table('rbim_censuses')->where('id', $row->id)->update([
                'q54_female_death_age' => $female[0]['age'] ?? null,
                'q54_female_death_cause' => $female[0]['cause'] ?? null,
                'q55_child_death_age' => $child[0]['age'] ?? null,
                'q55_child_death_sex' => $child[0]['sex'] ?? null,
                'q55_child_death_cause' => $child[0]['cause'] ?? null,
                'q56_common_disease_1' => $diseases[0] ?? null,
                'q56_common_disease_2' => $diseases[1] ?? null,
                'q56_common_disease_3' => $diseases[2] ?? null,
                'q57_primary_need_1' => $needs[0] ?? null,
                'q57_primary_need_2' => $needs[1] ?? null,
                'q57_primary_need_3' => $needs[2] ?? null,
            ]);
        }

        Schema::table('rbim_censuses', function (Blueprint $table) {
            $table->dropColumn([
                'q54_female_deaths', 'q55_child_deaths',
                'q56_common_diseases', 'q57_primary_needs',
            ]);
        });

        Schema::table('rbim_census_members', function (Blueprint $table) {
            $table->dropColumn('q43_other');
            $table->decimal('q15_monthly_income', 12, 2)->unsigned()->nullable()->change();
        });
    }
};
