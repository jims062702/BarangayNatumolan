<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Certificates are no longer approved or rejected by the Punong Barangay.
 *
 * The resident asks, the CLERK does the work, and the PB/Secretary only
 * signs the paper — so the register now tracks the physical journey of the
 * document instead of a digital decision:
 *
 *   Pending → Processing → Printed → For Signature → Ready to Claim → Released
 *
 * `Cancelled` is the one exit off that line (withdrawn, duplicate, wrong
 * person) and is where the retired "Rejected" records land.
 */
return new class extends Migration
{
    /** Old status → its place on the new line. */
    private const STATUS_MAP = [
        'Application' => 'Pending',      // filed, nobody has picked it up yet
        'Verification' => 'Processing',
        'Approved' => 'Processing',      // decided but unprinted → the clerk's desk
        'Rejected' => 'Cancelled',
    ];

    public function up(): void
    {
        // The enum would reject the new labels, so widen the column first.
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->string('status', 32)->default('Pending')->change();
        });

        foreach (self::STATUS_MAP as $old => $new) {
            DB::table('certificates_clearances')->where('status', $old)->update(['status' => $new]);
        }

        Schema::table('certificates_clearances', function (Blueprint $table) {
            // Who took the request off the queue, and when.
            $table->unsignedBigInteger('processed_by')->nullable()->after('status');
            $table->dateTime('processed_at')->nullable()->after('processed_by');
            $table->dateTime('printed_at')->nullable()->after('processed_at');
            // The wet signature of the Punong Barangay / Secretary.
            $table->unsignedBigInteger('signed_by')->nullable()->after('printed_at');
            $table->dateTime('signed_at')->nullable()->after('signed_by');
            // Ready on the counter, then handed over.
            $table->dateTime('ready_at')->nullable()->after('signed_at');
            $table->dateTime('claimed_at')->nullable()->after('ready_at');
            $table->string('cancel_reason', 500)->nullable()->after('claimed_at');

            $table->foreign('processed_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('signed_by')->references('id')->on('users')->nullOnDelete();
        });

        // Carry the history across before the old columns go.
        DB::statement('UPDATE certificates_clearances SET signed_by = approved_by, signed_at = approved_at');
        if (Schema::hasColumn('certificates_clearances', 'rejection_reason')) {
            DB::statement('UPDATE certificates_clearances SET cancel_reason = rejection_reason WHERE rejection_reason IS NOT NULL');
        }
        // A released certificate was, by definition, claimed.
        DB::statement('UPDATE certificates_clearances SET claimed_at = released_at, ready_at = released_at WHERE released_at IS NOT NULL');

        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropColumn(['approved_by', 'approved_at']);
            if (Schema::hasColumn('certificates_clearances', 'rejection_reason')) {
                $table->dropColumn('rejection_reason');
            }
        });
    }

    public function down(): void
    {
        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
        });

        DB::statement('UPDATE certificates_clearances SET approved_by = signed_by, approved_at = signed_at');
        DB::statement('UPDATE certificates_clearances SET rejection_reason = cancel_reason WHERE cancel_reason IS NOT NULL');

        // Lossy on purpose: Verification and Approved both became Processing.
        foreach (['Pending' => 'Application', 'Processing' => 'Approved', 'For Signature' => 'Approved',
                  'Ready to Claim' => 'Printed', 'Cancelled' => 'Rejected'] as $newStatus => $oldStatus) {
            DB::table('certificates_clearances')->where('status', $newStatus)->update(['status' => $oldStatus]);
        }

        Schema::table('certificates_clearances', function (Blueprint $table) {
            $table->dropForeign(['processed_by']);
            $table->dropForeign(['signed_by']);
            $table->dropColumn([
                'processed_by', 'processed_at', 'printed_at',
                'signed_by', 'signed_at', 'ready_at', 'claimed_at', 'cancel_reason',
            ]);
            $table->enum('status', ['Application', 'Verification', 'Approved', 'Printed', 'Released', 'Rejected'])
                ->default('Application')->change();
        });
    }
};
