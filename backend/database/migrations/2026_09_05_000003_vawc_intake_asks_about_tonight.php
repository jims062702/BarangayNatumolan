<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The four questions the intake never asked, and one that follows them.
 *
 * Everything the form collected was history: what happened, how often it has
 * happened before, who the children are. None of it answered the question a
 * VAWC officer actually needs answered at the desk — is she safe tonight?
 *
 *   occurred_at      The complaint carried a report_date and nothing for when
 *                    the incident itself happened. Prescription periods run
 *                    from the act, and "last night" and "last year" are not
 *                    the same case.
 *   location         Where it happened. Encrypted: a place in a barangay of
 *                    this size names a household.
 *   is_ongoing       Whether it is still happening.
 *   offender_nearby  Whether the person complained of is with or near her
 *                    right now. This and the one above are the whole of the
 *                    immediate risk assessment; everything else is history.
 *
 * And on the case itself:
 *
 *   risk_level       One scale, kept current. `vawc_followups.safety_status`
 *                    already records how a survivor was found on a visit, so
 *                    this is set at intake and then MOVED by each follow-up —
 *                    otherwise the docket would show, a year on, the level
 *                    somebody assessed on the first day, which is worse than
 *                    showing nothing because it looks true.
 *   risk_assessed_at When that level was last judged, so a stale one is
 *                    visibly stale.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vawc_incidents', function (Blueprint $table) {
            $table->dateTime('occurred_at')->nullable()->after('vawc_case_id');
            $table->text('location')->nullable()->after('occurred_at');
            $table->boolean('is_ongoing')->nullable()->after('location');
            $table->boolean('offender_nearby')->nullable()->after('is_ongoing');
        });

        Schema::table('vawc_cases', function (Blueprint $table) {
            /*
             * Nullable on purpose: a case encoded before this existed has no
             * assessment, and "Unknown" is the truth about it. A default of
             * Low would quietly mark every old case safe.
             */
            $table->enum('risk_level', ['Low', 'Medium', 'High', 'Critical'])
                ->nullable()->after('violence_type');
            $table->dateTime('risk_assessed_at')->nullable()->after('risk_level');

            // How the complaint reached the barangay.
            $table->string('reporting_channel', 60)->nullable()->after('reported_by_contact');

            $table->index('risk_level');
        });
    }

    public function down(): void
    {
        Schema::table('vawc_cases', function (Blueprint $table) {
            $table->dropIndex(['risk_level']);
            $table->dropColumn(['risk_level', 'risk_assessed_at', 'reporting_channel']);
        });

        Schema::table('vawc_incidents', function (Blueprint $table) {
            $table->dropColumn(['occurred_at', 'location', 'is_ongoing', 'offender_nearby']);
        });
    }
};
