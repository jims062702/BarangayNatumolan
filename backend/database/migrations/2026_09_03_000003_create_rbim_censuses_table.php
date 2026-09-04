<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One RBIM baseline census form — the household half.
 *
 * The Registry of Barangay Inhabitants and Migrants form is a SURVEY, not
 * the register. It is taken on a date, by an interviewer, in a round; a
 * quarter of its answers are true only on that day — where somebody worked,
 * which health facility they used in the last twelve months, why they left
 * their previous barangay. Writing those straight into `residents` would put
 * a snapshot where a permanent record belongs.
 *
 * So the form is captured as itself, exactly as the paper reads, and the
 * Population Office reconciles it into the registry afterwards. That review
 * step is what stops one mis-keyed census night overwriting a register the
 * office has spent months curating.
 *
 * Section B (Interview Information) is deliberately absent — the barangay
 * does not want the visit log.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rbim_censuses', function (Blueprint $table) {
            $table->id();

            /*
             * The number printed on the form's top-right boxes. Six of them
             * on paper, kept as a string: it is an identifier the barangay
             * assigns, not a quantity, and leading zeros are part of it.
             */
            $table->string('census_no', 20)->nullable()->index();

            /*
             * The paper offers two boxes: Household, or Institutional Living
             * Quarters — a dormitory, a care home, a barracks. They are
             * counted differently and this is the only thing that says which.
             */
            $table->boolean('is_institutional')->default(false);

            /* ---- A. IDENTIFICATION ---- */
            $table->string('province', 100)->nullable();
            $table->string('city_municipality', 100)->nullable();
            $table->string('barangay', 100)->nullable();

            // Three separate lines on the form, kept separate: a clerk
            // reading a printed census back needs the same three blanks.
            $table->string('address_unit', 150)->nullable();      // Room/Floor/Unit + Building
            $table->string('address_house_lot', 150)->nullable(); // House/Lot and Block No.
            $table->string('address_street', 150)->nullable();    // Street Name

            $table->string('respondent_name', 150)->nullable();
            $table->string('household_head_name', 150)->nullable();
            $table->unsignedSmallInteger('total_members')->nullable();

            /*
             * The household this form turned out to be about, once somebody
             * decided. Null until the review: a census taken door-to-door
             * finds houses the register has never heard of, and pretending
             * otherwise is how a new household gets silently attached to an
             * existing one.
             */
            $table->foreignId('household_id')->nullable()
                ->constrained()->nullOnDelete();

            /* ---- H. QUESTIONS FOR THE HOUSEHOLD (Q45–Q58) ---- */

            // Q45/Q46: 1 rent-free w/o consent · 2 rent-free w/ consent · 3 rented · 4 owned/amortized
            $table->unsignedTinyInteger('q45_housing_tenure')->nullable();
            $table->unsignedTinyInteger('q46_lot_tenure')->nullable();

            // Q47 lighting fuel: 0 none · 1 oil · 2 LPG · 3 kerosene · 4 electricity · 5 others
            $table->unsignedTinyInteger('q47_lighting_fuel')->nullable();
            $table->string('q47_other', 100)->nullable();

            // Q48 cooking fuel: 0 none · 1 wood · 2 charcoal · 3 LPG · 4 kerosene · 5 electricity · 6 others
            $table->unsignedTinyInteger('q48_cooking_fuel')->nullable();
            $table->string('q48_other', 100)->nullable();

            // Q49 drinking water: 1–12 (see RbimCensus::WATER_SOURCES)
            $table->unsignedTinyInteger('q49_water_source')->nullable();
            $table->string('q49_other', 100)->nullable();

            // Q50a disposal 1–6, Q50b segregates 1 yes / 2 no
            $table->unsignedTinyInteger('q50a_garbage_disposal')->nullable();
            $table->unsignedTinyInteger('q50b_segregates')->nullable();

            // Q51 toilet: 0 none · 1 open pit … 7 others
            $table->unsignedTinyInteger('q51_toilet')->nullable();
            $table->string('q51_other', 100)->nullable();

            // Q52/Q53 are marked <observation only> on the form — the
            // interviewer looks, rather than asking.
            $table->unsignedTinyInteger('q52_building_type')->nullable();
            $table->unsignedTinyInteger('q53_outer_wall')->nullable();
            $table->string('q53_other', 100)->nullable();

            /*
             * Q54/Q55 — deaths in the past 12 months.
             *
             * These are how a barangay notices a maternal or under-five death
             * that never reached a hospital record. Free text for the cause:
             * a household reports what they were told, not an ICD code.
             */
            $table->unsignedTinyInteger('q54_female_death_age')->nullable();
            $table->string('q54_female_death_cause', 150)->nullable();
            $table->unsignedTinyInteger('q55_child_death_age')->nullable();
            $table->unsignedTinyInteger('q55_child_death_sex')->nullable();
            $table->string('q55_child_death_cause', 150)->nullable();

            // Q56/Q57 — three blanks each on the paper.
            $table->string('q56_common_disease_1', 120)->nullable();
            $table->string('q56_common_disease_2', 120)->nullable();
            $table->string('q56_common_disease_3', 120)->nullable();
            $table->string('q57_primary_need_1', 120)->nullable();
            $table->string('q57_primary_need_2', 120)->nullable();
            $table->string('q57_primary_need_3', 120)->nullable();

            // Q58 — where the household intends to be in five years.
            $table->string('q58_intend_barangay', 100)->nullable();
            $table->string('q58_intend_municipality', 100)->nullable();
            $table->string('q58_intend_province', 100)->nullable();

            /*
             * Proof of consent. The form carries a signature block, and the
             * census may not be used without it — so the record says whether
             * it was given and by whom.
             */
            $table->boolean('consent_given')->default(false);
            $table->string('consent_name', 150)->nullable();

            /* ---- C. ENCODING INFORMATION ---- */
            $table->date('date_encoded')->nullable();
            $table->string('encoder_name', 150)->nullable();
            $table->string('supervisor_name', 150)->nullable();

            /*
             * Draft while the BHW is still filling it in, Submitted once it
             * reaches the Population Office, Reviewed once somebody has gone
             * through it against the register. Nothing reaches `residents`
             * before Reviewed.
             */
            $table->enum('status', ['Draft', 'Submitted', 'Reviewed'])->default('Draft');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();

            // Who keyed it in — the BHW, usually.
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();

            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rbim_censuses');
    }
};
