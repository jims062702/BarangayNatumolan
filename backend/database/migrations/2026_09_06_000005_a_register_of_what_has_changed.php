<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per kind of record, carrying a number that moves when it changes.
 *
 * Every page in this system re-fetched its whole list on a timer to find out
 * whether anything had happened — twelve seconds for a work queue, thirty for
 * the portal. So a clerk saw a colleague's entry up to half a minute late,
 * and the server answered the same question with the same answer hundreds of
 * times an hour.
 *
 * Asking "has anything changed?" is a different question from "give me
 * everything". It is one indexed read of a table with a dozen rows, so it can
 * be asked every second, and the expensive fetch happens only when the answer
 * is yes.
 *
 * A counter rather than a timestamp: MAX(updated_at) cannot see a DELETE, and
 * a row disappearing from a list is exactly the change somebody is waiting to
 * see. Two writes in the same second are also two different versions here,
 * where one timestamp would have hidden the second.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('change_log', function (Blueprint $table) {
            /* The topic IS the key — one row per kind, never more. */
            $table->string('topic', 64)->primary();
            $table->unsignedBigInteger('version')->default(0);
            $table->dateTime('changed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('change_log');
    }
};
