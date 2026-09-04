<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Live-agent chat. The bot answers first; when it cannot help (or the person
 * asks for a human), the conversation is handed to the BARANGAY SECRETARY,
 * who owns the live desk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_conversations', function (Blueprint $table) {
            $table->id();
            /*
             * The visitor's handle on this conversation. It is what a
             * logged-out person on the landing page has instead of an
             * account, so it is unguessable and is the only key the public
             * endpoints accept.
             */
            $table->string('session_token', 64)->unique();
            // Set when the person is signed in to the resident portal.
            $table->unsignedBigInteger('resident_id')->nullable();
            $table->string('guest_name')->nullable();
            $table->string('guest_email')->nullable();
            $table->string('guest_contact')->nullable();
            $table->string('topic')->nullable();
            // Waiting = nobody has picked it up yet.
            $table->enum('status', ['Waiting', 'Active', 'Closed'])->default('Waiting');
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->dateTime('claimed_at')->nullable();
            $table->dateTime('closed_at')->nullable();
            $table->dateTime('last_message_at')->nullable();
            // Unread counters, kept per side so both inboxes can badge.
            $table->unsignedInteger('unread_for_agent')->default(0);
            $table->unsignedInteger('unread_for_visitor')->default(0);
            $table->timestamps();

            $table->foreign('resident_id')->references('id')->on('residents')->nullOnDelete();
            $table->foreign('assigned_to')->references('id')->on('users')->nullOnDelete();
            $table->index(['status', 'last_message_at']);
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('chat_conversation_id');
            // Who said it: the person on the website, or the barangay staffer.
            $table->enum('sender', ['visitor', 'agent', 'system'])->default('visitor');
            $table->unsignedBigInteger('user_id')->nullable(); // set for 'agent'
            $table->text('body');
            $table->timestamps();

            $table->foreign('chat_conversation_id')->references('id')->on('chat_conversations')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['chat_conversation_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_conversations');
    }
};
