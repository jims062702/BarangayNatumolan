<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    protected $fillable = [
        'resident_id',
        'user_id',
        'notification_type',
        'subject',
        'message',
        'channel',
        'is_sent',
        'sent_at',
        'is_read',
        'read_at',
        'related_entity_type',
        'related_entity_id',
    ];

    protected function casts(): array
    {
        return [
            'is_sent' => 'boolean',
            'is_read' => 'boolean',
            'sent_at' => 'datetime',
            'read_at' => 'datetime',
        ];
    }

    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Helper used across controllers to notify a resident in-system. */
    public static function notifyResident(?int $residentId, string $type, string $subject, string $message, ?string $entityType = null, ?int $entityId = null): ?self
    {
        if (!$residentId) {
            return null;
        }

        return self::create([
            'resident_id' => $residentId,
            'notification_type' => $type,
            'subject' => $subject,
            'message' => $message,
            'channel' => 'In-System',
            'is_sent' => true,
            'sent_at' => now(),
            'related_entity_type' => $entityType,
            'related_entity_id' => $entityId,
        ]);
    }

    /** Notify a set of staff users in-system (one row each). */
    public static function notifyUsers(iterable $userIds, string $type, string $subject, string $message, ?string $entityType = null, ?int $entityId = null): void
    {
        foreach ($userIds as $userId) {
            self::create([
                'user_id' => $userId,
                'notification_type' => $type,
                'subject' => $subject,
                'message' => $message,
                'channel' => 'In-System',
                'is_sent' => true,
                'sent_at' => now(),
                'related_entity_type' => $entityType,
                'related_entity_id' => $entityId,
            ]);
        }
    }

    /** Notify every active Punong Barangay (certificate decisions, etc.). */
    public static function notifyPunongBarangay(string $type, string $subject, string $message, ?string $entityType = null, ?int $entityId = null): void
    {
        $ids = User::where('is_active', true)->where('role', 'Punong Barangay')->pluck('id');
        self::notifyUsers($ids, $type, $subject, $message, $entityType, $entityId);
    }

    /** Notify the Main Office front desk (clerks/secretary — not the PB). */
    public static function notifyFrontDesk(string $type, string $subject, string $message, ?string $entityType = null, ?int $entityId = null): void
    {
        $ids = User::where('is_active', true)
            ->where('office', 'Main Office')
            ->where('role', '!=', 'Punong Barangay')
            ->pluck('id');
        self::notifyUsers($ids, $type, $subject, $message, $entityType, $entityId);
    }
}
