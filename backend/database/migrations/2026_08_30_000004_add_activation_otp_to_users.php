<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Portal accounts are now created automatically the moment a resident is
 * registered, so the account exists before anyone has proved they own the
 * mailbox behind it. The first login therefore has a second step: a one-time
 * code sent to that address, which is what actually turns the account on.
 *
 * Staff accounts are made by hand by an administrator who has already
 * verified the person, so they are stamped activated at once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Null = the code has never been entered; the account cannot sign in yet.
            $table->dateTime('activated_at')->nullable()->after('is_active');
            // Wide enough for a bcrypt hash: the code is a credential, so
            // the row stores a hash of it, never the six digits themselves.
            $table->string('otp_code', 255)->nullable()->after('activated_at');
            $table->dateTime('otp_expires_at')->nullable()->after('otp_code');
            $table->dateTime('otp_sent_at')->nullable()->after('otp_expires_at');
            // Guards against someone grinding through the 1,000,000 codes.
            $table->unsignedTinyInteger('otp_attempts')->default(0)->after('otp_sent_at');
        });

        // Everyone who already had a working login keeps it — the new step
        // applies only to accounts issued from here on.
        DB::table('users')->whereNull('activated_at')->update(['activated_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['activated_at', 'otp_code', 'otp_expires_at', 'otp_sent_at', 'otp_attempts']);
        });
    }
};
