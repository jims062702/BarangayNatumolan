<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The particulars each printed form asks for.
 *
 * Until now a certificate record held the transaction — a number, a type, a
 * fee, who signed it and when — and none of the DOCUMENT. The paper was made
 * in Word, by hand, from a folder of templates, and the system recorded that
 * a thing it had never seen had been printed.
 *
 * So the wording had nowhere to live. A death certification needs the date
 * and hour and place of a death; a common-law certification needs a partner
 * and a number of years; a construction clearance needs to say what work was
 * applied for. None of that is a property of the resident and none of it is a
 * property of the fee. It belongs to the one document being issued.
 *
 * One JSON column rather than thirty nullable ones: the fields differ per
 * type, the set will grow the next time the barangay adds a form, and a table
 * with thirty columns of which three are ever filled is a table nobody can
 * read. CertificateCatalogue names which keys each type expects.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->json('template_fields')->nullable()->after('purpose');

            /*
             * The photograph, for the clearance that carries one. Taken at
             * the counter and uploaded — the two thumbmarks are still inked
             * onto the printed sheet by hand, which is the one part of this
             * a computer should not be pretending to do.
             */
            $table->string('photo_path')->nullable()->after('template_fields');
        });
    }

    public function down(): void
    {
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->dropColumn(['template_fields', 'photo_path']);
        });
    }
};
