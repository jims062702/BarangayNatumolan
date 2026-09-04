<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `otp_code` was first created 10 characters wide, as if it held the six
 * digits. It holds a bcrypt HASH of them — the code is a credential, and a
 * database dump should never reveal a live one — so every write overflowed.
 *
 * The original migration now creates the column at full width; this exists
 * for databases that had already run it. It is a harmless no-op elsewhere.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('otp_code', 255)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Deliberately not narrowed again: doing so would truncate live hashes.
    }
};
