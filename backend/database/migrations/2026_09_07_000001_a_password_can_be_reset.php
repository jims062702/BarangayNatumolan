<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two ways back into an account, and a record of which one was used.
 *
 * Until now a forgotten password had no route at all: somebody with a
 * database client had to write a new hash by hand, which is exactly the
 * arrangement the barangay is moving away from. A person asks for a code and
 * it goes to their own email; or they come to the Population Office counter
 * and a clerk sets one for them.
 *
 * The second one is the reason for the log. A password set by somebody other
 * than its owner is an event worth being able to point at afterwards, and
 * "who did this" is not a question a system should answer with a shrug.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('password_reset_tokens', function (Blueprint $table) {
            /*
             * Wrong guesses. Without a ceiling a six-digit code is a million
             * tries, and a million tries against one row is an afternoon.
             */
            $table->unsignedTinyInteger('attempts')->default(0)->after('token');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dateTime('password_set_at')->nullable();

            /*
             * Null when the owner set it themselves — through the emailed
             * code, or from their own profile. Filled only when a clerk set
             * it for them, which is the case worth being able to find.
             */
            $table->unsignedBigInteger('password_set_by')->nullable();

            $table->foreign('password_set_by')
                ->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('password_reset_tokens', function (Blueprint $table) {
            $table->dropColumn('attempts');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['password_set_by']);
            $table->dropColumn(['password_set_at', 'password_set_by']);
        });
    }
};
