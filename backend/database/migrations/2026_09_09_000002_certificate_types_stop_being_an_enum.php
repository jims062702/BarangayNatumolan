<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The certificate type stops being a fixed list in the database.
 *
 * It was an ENUM of the eight types the system launched with. The barangay
 * issues twelve, and MySQL does not refuse an unlisted value so much as
 * mangle it — "Data truncated for column 'certificate_type'" — so filing a
 * death certification failed at the last moment with a database error the
 * clerk could do nothing about.
 *
 * A VARCHAR instead, with the list living in App\Support\CertificateCatalogue
 * where the validation rule already reads it. One place saying which types
 * exist, and it is the place that also knows what each one costs and asks
 * for. An enum would have to be migrated every time the barangay adds a form,
 * which is the kind of change that should not need a developer.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * Raw SQL, deliberately. Doctrine's change() cannot read a MySQL
         * enum without doctrine/dbal, and this is one line either way.
         */
        DB::statement(
            "ALTER TABLE `certificates_clearances`
             MODIFY `certificate_type` VARCHAR(120) NOT NULL DEFAULT 'Barangay Clearance'"
        );
    }

    public function down(): void
    {
        DB::statement(
            "ALTER TABLE `certificates_clearances`
             MODIFY `certificate_type` ENUM(
                'Barangay Clearance','Certificate of Residency','Certificate of Indigency',
                'First-Time Jobseeker','Certificate of Low or No Income',
                'Business Barangay Clearance','Good Moral Character','Other'
             ) NOT NULL DEFAULT 'Barangay Clearance'"
        );
    }
};
