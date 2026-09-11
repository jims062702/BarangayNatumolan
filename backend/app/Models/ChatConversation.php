<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * One live-agent conversation between a person on the website and the
 * Barangay Secretary, who staffs the live desk.
 */
class ChatConversation extends Model
{
    protected $fillable = [
        'session_token',
        'resident_id',
        'guest_name',
        'guest_email',
        'guest_contact',
        'topic',
        'status',
        'assigned_to',
        'claimed_at',
        'closed_at',

        /* Set when a resident picks a finished conversation back up. */
        'follow_up_count',
        'reopened_at',
        'last_closed_at',
        'last_message_at',
        'unread_for_agent',
        'unread_for_visitor',
    ];

    /*
     * The column defaults only apply to the INSERT — a freshly created model
     * still holds null for these in memory, and the first message then wrote
     * that null straight back over the counter it was not incrementing.
     */
    protected $attributes = [
        'status' => 'Waiting',
        'unread_for_agent' => 0,
        'unread_for_visitor' => 0,
    ];

    protected function casts(): array
    {
        return [
            'unread_for_agent' => 'integer',
            'unread_for_visitor' => 'integer',
            'claimed_at' => 'datetime',
            'closed_at' => 'datetime',
            'follow_up_count' => 'integer',
            'reopened_at' => 'datetime',
            'last_closed_at' => 'datetime',
            'last_message_at' => 'datetime',
        ];
    }

    /**
     * The token is the visitor's ONLY credential — a landing-page visitor has
     * no account — so it is generated here rather than accepted from input.
     */
    public static function newSessionToken(): string
    {
        return Str::random(48);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class)->orderBy('id');
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** Whoever is on the other end, named for the agent's worklist. */
    public function getVisitorNameAttribute(): string
    {
        return $this->resident?->full_name
            ?: ($this->guest_name ?: 'Guest visitor');
    }

    /** Records a message and moves both unread counters in one place. */
    public function addMessage(string $sender, string $body, ?int $userId = null): ChatMessage
    {
        $message = $this->messages()->create([
            'sender' => $sender,
            'user_id' => $userId,
            'body' => $body,
        ]);

        $this->forceFill([
            'last_message_at' => now(),
            // A system line is nobody's unread — it narrates, it doesn't ask.
            'unread_for_agent' => (int) $this->unread_for_agent + ($sender === 'visitor' ? 1 : 0),
            'unread_for_visitor' => (int) $this->unread_for_visitor + ($sender === 'agent' ? 1 : 0),
        ])->save();

        return $message;
    }
}
