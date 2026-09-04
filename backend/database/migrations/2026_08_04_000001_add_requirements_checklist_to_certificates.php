<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Documentary requirement checklist (module 1.1). Records which documents the
 * applicant actually presented at the counter, so an approval can be traced
 * back to the papers that supported it.
 *
 * Stored as JSON — [{"item": "Valid ID", "presented": true}, …] — because the
 * requirement list per certificate type is configurable in the service guide
 * and changes without a schema change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->json('requirements_checklist')->nullable()->after('purpose');
        });
    }

    public function down(): void
    {
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->dropColumn('requirements_checklist');
        });
    }
};
