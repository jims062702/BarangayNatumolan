<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A closed conversation can be picked up again.
 *
 * Closing a chat used to be final: writing to it returned "start a new one if
 * you still need help", so a resident with one more question about the same
 * certificate opened a second conversation the desk saw as a stranger's first
 * contact. The thread that explained it was one row away and nobody could
 * reach it.
 *
 * The count matters as much as the flag. A conversation reopened once is
 * somebody who forgot to ask something; reopened four times is a matter the
 * desk keeps closing without settling, and that is worth being able to see.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->unsignedInteger('follow_up_count')->default(0)->after('status');

            /*
             * When it was last brought back. Distinct from `last_message_at`,
             * which every message moves — this only moves when a closed
             * conversation is reopened, so the desk can sort by it.
             */
            $table->dateTime('reopened_at')->nullable()->after('closed_at');

            /*
             * The gap the desk is answering across.
             *
             * `closed_at` is overwritten the next time it closes, so without
             * this the agent reading a reopened thread cannot tell whether it
             * went quiet for an hour or for a month — which changes how much
             * of it they need to read back.
             */
            $table->dateTime('last_closed_at')->nullable()->after('reopened_at');

            $table->index('reopened_at');
        });
    }

    public function down(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropIndex(['reopened_at']);
            $table->dropColumn(['follow_up_count', 'reopened_at', 'last_closed_at']);
        });
    }
};
