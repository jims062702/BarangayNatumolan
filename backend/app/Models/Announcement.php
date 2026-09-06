<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class Announcement extends Model
{
    /**
     * The five kinds of post, and what each one is FOR.
     *
     * The distinction that matters most is Event against Activity: the same
     * medical mission is an Event before it happens and an Activity after,
     * and only one of the two belongs on a resident's calendar.
     */
    public const KINDS = [
        'Announcement' => 'Something residents need to know',
        'Event' => 'Something coming up that they can join',
        'Activity' => 'Something the barangay has already done',
        'Advisory' => 'Something urgent, with a start and an end',
        'Program' => 'A service they can come and claim',
    ];

    public const STATUSES = ['Draft', 'Published', 'Archived'];

    public const URGENCIES = ['Low', 'Medium', 'High', 'Critical'];

    /**
     * The fields each kind actually uses.
     *
     * A form that asks an Announcement for its venue and its expiry date is a
     * form nobody finishes. Named here rather than in the form so the server
     * and the screen cannot drift apart about what a kind means.
     */
    public const FIELDS = [
        'Announcement' => [],
        'Event' => ['event_at', 'event_time', 'location', 'organizer', 'contact_info', 'registration_deadline'],
        'Activity' => ['completed_at', 'location', 'participants'],
        'Advisory' => ['effective_at', 'expires_at', 'urgency'],
        'Program' => ['location', 'contact_info', 'registration_deadline'],
    ];

    protected $fillable = [
        'title',
        'body',
        'author_name',
        'excerpt',
        'status',
        'category',
        'location',
        'event_at',
        'event_time',
        'organizer',
        'contact_info',
        'registration_deadline',
        'completed_at',
        'participants',
        'effective_at',
        'expires_at',
        'urgency',
        'image_path',
        'sort_order',
        'published_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'event_at' => 'datetime',
            'registration_deadline' => 'date',
            'completed_at' => 'date',
            'effective_at' => 'datetime',
            'expires_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    protected $appends = ['image_url', 'byline'];

    /**
     * The name a post is signed with.
     *
     * `author_name` is what the office typed — "SK Secretary" — and is what
     * should appear when it is there. When it is not, the account that
     * created the post stands in, because a post with no name on it reads as
     * nobody's: a resident cannot tell an official notice from a mistake.
     *
     * Falls back to nothing rather than to a guess. An imported post with
     * neither is shown unsigned, which is honest.
     */
    public function getBylineAttribute(): ?string
    {
        if ($this->author_name) {
            return $this->author_name;
        }

        /* Only when already loaded — this is read on every card in a list. */
        return $this->relationLoaded('creator') ? $this->creator?->name : null;
    }

    public function getImageUrlAttribute(): ?string
    {
        return $this->image_path ? asset(Storage::url($this->image_path)) : null;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * What the public may see.
     *
     * An expired advisory is dropped here rather than left for the reader to
     * work out. A water-interruption notice with a Tuesday expiry sitting at
     * the top of the page on Friday is worse than no notice: it is a barangay
     * telling residents something that is not true any more.
     */
    public function scopePublic(Builder $query): Builder
    {
        return $query->where('status', 'Published')
            ->where(function (Builder $q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>=', now());
            });
    }

    /**
     * Events still to come, soonest first.
     *
     * "Still to come" is measured to the END of the event's day: an assembly
     * at eight in the morning is not stale by lunchtime, and a resident
     * checking at noon should still see where it was.
     */
    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where('category', 'Event')
            ->whereNotNull('event_at')
            ->where('event_at', '>=', now()->startOfDay())
            ->reorder()
            ->orderBy('event_at');
    }
}
