<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One line on the RBIM form's member grid — Q1 through Q44 for one person.
 *
 * The paper is a wide table: ten numbered lines across nine spreads, the
 * same person carried across every page by their line number. This mirrors
 * it, one row per line, because a census that cannot be read back against
 * the paper it came from cannot be checked.
 *
 * Codes are stored as the NUMBERS the form uses, not as words. The
 * interviewer writes 03 for a son and 07 for retirement, the encoder types
 * what the interviewer wrote, and the meaning lives in one place —
 * RbimCensusMember — rather than being translated twice on the way in.
 *
 * Q15 (monthly income) is deliberately absent: this system holds no money
 * figures anywhere, and a census is not the place to start.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rbim_census_members', function (Blueprint $table) {
            $table->id();

            $table->foreignId('rbim_census_id')->constrained()->cascadeOnDelete();

            /** The line number on the paper — 1 to 10, and the order they were listed in. */
            $table->unsignedTinyInteger('line_no');

            /* ---- A. DEMOGRAPHIC CHARACTERISTICS (all members) ---- */

            // Q1 — the form asks for surname, first name, middle name.
            $table->string('last_name', 100);
            $table->string('first_name', 100);
            $table->string('middle_name', 100)->nullable();

            // Q2 relationship to household head: 01 head … 22 domestic helper
            $table->unsignedTinyInteger('q2_relationship')->nullable();

            // Q3 sex: 1 male · 2 female
            $table->unsignedTinyInteger('q3_sex')->nullable();

            // Q4 age at last birthday — as reported, kept beside the birth
            // date rather than derived: they disagree often, and which one is
            // wrong is a question for the reviewer, not for the schema.
            $table->unsignedTinyInteger('q4_age')->nullable();

            // Q5 date of birth — month and year only, as the form asks.
            $table->unsignedTinyInteger('q5_birth_month')->nullable();
            $table->unsignedSmallInteger('q5_birth_year')->nullable();

            // Q6 place of birth — city/municipality and province, free text.
            $table->string('q6_birthplace', 150)->nullable();

            // Q7 nationality: 1 Filipino · 2 non-Filipino (then the country)
            $table->unsignedTinyInteger('q7_nationality')->nullable();
            $table->string('q7_nationality_other', 100)->nullable();

            // Q8 marital status: 1 single … 7 unknown
            $table->unsignedTinyInteger('q8_marital_status')->nullable();

            // Q9/Q10 — written as given. A barangay meets religions and
            // ethnicities no code list anticipates.
            $table->string('q9_religion', 100)->nullable();
            $table->string('q10_ethnicity', 100)->nullable();

            // Q11 highest level completed: 00 none … 13 post-graduate (5+ yrs)
            $table->unsignedTinyInteger('q11_education')->nullable();

            // Q12 currently enrolled: 1 yes public · 2 yes private · 3 no (3–24 yrs)
            $table->unsignedTinyInteger('q12_enrolled')->nullable();

            // Q13 school level: 0 pre-school … 5 college/university
            $table->unsignedTinyInteger('q13_school_level')->nullable();

            // Q14 place of school — barangay and city/municipality.
            $table->string('q14_school_place', 150)->nullable();

            /* ---- B. ECONOMIC ACTIVITY (15 and above) ---- */

            // Q15 is not collected — see the class comment.

            // Q16 source of income: 1 employment · 2 business · 3 remittance
            //                       · 4 investments · 5 others
            $table->unsignedTinyInteger('q16_income_source')->nullable();

            // Q17 status of work/business: 1 permanent … 6 corporate business
            $table->unsignedTinyInteger('q17_work_status')->nullable();

            // Q18 place of work — barangay and city/municipality.
            $table->string('q18_work_place', 150)->nullable();

            /* ---- C. HEALTH INFORMATION: 0–11 months old ---- */

            // Q19 place of delivery: 1 public hospital … 4 home (+ others)
            $table->unsignedTinyInteger('q19_delivery_place')->nullable();
            $table->string('q19_other', 100)->nullable();

            // Q20 birth attendant: 1 doctor · 2 nurse · 3 midwife · 4 hilot
            $table->unsignedTinyInteger('q20_birth_attendant')->nullable();
            $table->string('q20_other', 100)->nullable();

            // Q21 last vaccine received — written from the baby book.
            $table->string('q21_immunization', 120)->nullable();

            /* ---- C. HEALTH: women 10 to 54 ---- */

            /*
             * Q22 asks two numbers in one box: pregnancies in the upper
             * triangle, children still living in the lower. They are stored
             * apart because the gap between them is the whole point of the
             * question.
             */
            $table->unsignedTinyInteger('q22_pregnancies')->nullable();
            $table->unsignedTinyInteger('q22_living_children')->nullable();

            // Q23 FP method in use: 1 ligation … 9 LAM · 0 none
            $table->unsignedTinyInteger('q23_fp_method')->nullable();

            // Q24 source of the method: 1 government hospital … 5 pharmacy
            $table->unsignedTinyInteger('q24_fp_source')->nullable();
            $table->string('q24_other', 100)->nullable();

            // Q25 intention: 1 yes (then which method) · 2 no (then why not)
            $table->unsignedTinyInteger('q25_fp_intention')->nullable();
            $table->string('q25_detail', 150)->nullable();

            /* ---- C. HEALTH: all members ---- */

            // Q26 health insurance: 1 PhilHealth paying … 7 private/HMO
            $table->unsignedTinyInteger('q26_health_insurance')->nullable();
            $table->string('q26_other', 100)->nullable();

            // Q27 facility visited in the past 12 months: 1 govt hospital … 7 hilot
            $table->unsignedTinyInteger('q27_facility_visited')->nullable();
            $table->string('q27_other', 100)->nullable();

            // Q28 reason for the visit: 1 sick/injured … 7 NHTS/CCT/4Ps requirement
            $table->unsignedTinyInteger('q28_visit_reason')->nullable();
            $table->string('q28_other', 100)->nullable();

            // Q29 disability: 1 psychosocial … 9 multiple
            $table->unsignedTinyInteger('q29_disability')->nullable();

            /* ---- D. SOCIO-CIVIC PARTICIPATION ---- */

            // Q30 solo parent (10+): 1 registered · 2 not a solo parent · 3 unregistered
            $table->unsignedTinyInteger('q30_solo_parent')->nullable();

            // Q31 registered senior citizen (60+): 1 yes · 2 no
            $table->unsignedTinyInteger('q31_senior_registered')->nullable();

            // Q32 registered voter (15+) — the barangay they are registered in.
            $table->string('q32_voter_barangay', 100)->nullable();

            /* ---- E. MIGRATION (5 and above) ---- */

            $table->string('q33_residence_5yrs', 150)->nullable();   // barangay + city 5 years ago
            $table->string('q34_residence_6mos', 150)->nullable();   // barangay + city 6 months ago

            // Q35 length of stay — years in the upper triangle, months in the lower.
            $table->unsignedSmallInteger('q35_stay_years')->nullable();
            $table->unsignedTinyInteger('q35_stay_months')->nullable();

            // Q36 type of resident: 1 non-migrant · 2 migrant · 3 transient.
            // Marked <do not ask> on the form — it is worked out from Q33–Q35.
            $table->unsignedTinyInteger('q36_resident_type')->nullable();

            /* ---- E. MIGRATION: migrants and transients only ---- */

            $table->unsignedTinyInteger('q37_transfer_month')->nullable();
            $table->unsignedSmallInteger('q37_transfer_year')->nullable();

            // Q38A–C — up to three reasons for leaving, 01 … 15.
            $table->unsignedTinyInteger('q38a_leave_reason')->nullable();
            $table->unsignedTinyInteger('q38b_leave_reason')->nullable();
            $table->unsignedTinyInteger('q38c_leave_reason')->nullable();
            $table->string('q38_other', 120)->nullable();

            // Q39 return to previous residence: 1 yes (+ when) · 2 no
            $table->unsignedTinyInteger('q39_will_return')->nullable();
            $table->string('q39_when', 60)->nullable();

            // Q40A–C — up to three reasons for transferring here, 1 … 4 (+ other)
            $table->unsignedTinyInteger('q40a_transfer_reason')->nullable();
            $table->unsignedTinyInteger('q40b_transfer_reason')->nullable();
            $table->unsignedTinyInteger('q40c_transfer_reason')->nullable();
            $table->string('q40_other', 120)->nullable();

            // Q41 duration of stay intended: 1 yes (+ until when) · 2 no
            $table->unsignedTinyInteger('q41_intends_to_stay')->nullable();
            $table->string('q41_until', 60)->nullable();

            /* ---- F. COMMUNITY TAX CERTIFICATE (18 and above) ---- */

            // Q42A has a valid CTC: 1 yes · 2 no. Q42B issued in this barangay.
            $table->unsignedTinyInteger('q42a_has_ctc')->nullable();
            $table->unsignedTinyInteger('q42b_ctc_here')->nullable();

            /* ---- G. SKILLS DEVELOPMENT (15 and above) ---- */

            // Q43 training interested in: 01 refrigeration/aircon … 07 welding
            $table->unsignedTinyInteger('q43_training_interest')->nullable();

            // Q44 most prominent skill held: 01 … 18 (others, specified)
            $table->unsignedTinyInteger('q44_skill')->nullable();
            $table->string('q44_other', 120)->nullable();

            /*
             * The registry record this line turned out to be, once the
             * Population Office decided. Null while unreviewed — and null is
             * the honest state for somebody the register has never met.
             */
            $table->foreignId('resident_id')->nullable()
                ->constrained('residents')->nullOnDelete();

            $table->text('notes')->nullable();
            $table->timestamps();

            // One line number per form, and the order the grid is read in.
            $table->unique(['rbim_census_id', 'line_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rbim_census_members');
    }
};
