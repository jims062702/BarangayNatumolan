<?php

namespace App\Http\Controllers\Api;

use App\Models\Notification;
use Illuminate\Http\Request;

/**
 * In-system notices for the current account — residents see notices
 * addressed to their linked resident record; staff see notices addressed
 * to their user id.
 */
class NotificationController extends BaseController
{
    private function scoped()
    {
        $user = auth()->user();

        return $user->isResident()
            ? Notification::where('resident_id', $user->resident_id)
            : Notification::where('user_id', $user->id);
    }

    public function index(Request $request)
    {
        return $this->success([
            'unread_count' => (clone $this->scoped())->where('is_read', false)->count(),
            'notifications' => $this->scoped()->latest()->paginate(20),
        ], 'Notifications retrieved');
    }

    public function markRead(Notification $notification)
    {
        $user = auth()->user();
        $owned = $user->isResident()
            ? $notification->resident_id === $user->resident_id
            : $notification->user_id === $user->id;

        if (!$owned) {
            return $this->forbidden('Not your notification');
        }

        $notification->update(['is_read' => true, 'read_at' => now()]);

        return $this->success($notification, 'Marked as read');
    }

    public function markAllRead()
    {
        $this->scoped()->where('is_read', false)->update(['is_read' => true, 'read_at' => now()]);

        return $this->success(null, 'All notifications marked as read');
    }
}
