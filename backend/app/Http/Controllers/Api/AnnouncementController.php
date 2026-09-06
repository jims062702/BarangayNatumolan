<?php

namespace App\Http\Controllers\Api;

use App\Models\Announcement;
use App\Support\LandingCache;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Staff-side post management (public reads happen in PublicController).
 *
 * A barangay posts five different things and a resident wants them for five
 * different reasons — see Announcement::KINDS. This controller is the one
 * place that decides which fields a given kind is allowed to carry.
 */
class AnnouncementController extends BaseController
{
    public function index(Request $request)
    {
        $query = Announcement::with('creator:id,name');

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        /*
         * Counted BEFORE the status filter, so the chips keep saying how many
         * are in each pile while one of them is open.
         */
        $counts = $this->statusCounts(
            Announcement::query()->when(
                $request->filled('category'),
                fn ($q) => $q->where('category', $request->category)
            )
        );

        $page = $query->orderBy('sort_order')->latest('published_at')->latest('id')->paginate(15);

        return $this->success(
            $page->toArray() + ['status_counts' => $counts, 'kinds' => Announcement::KINDS],
            'Announcements retrieved'
        );
    }

    /** Reorder posts (first id = shown first). */
    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:announcements,id',
        ]);

        foreach ($validated['ids'] as $index => $id) {
            Announcement::where('id', $id)->update(['sort_order' => $index]);
        }
        LandingCache::clearAnnouncements();

        return $this->success(null, 'Order updated');
    }

    public function store(Request $request)
    {
        $validated = $request->validate($this->rules(true));

        if ($request->hasFile('image')) {
            $validated['image_path'] = $request->file('image')->store('news', 'public');
        }
        unset($validated['image']);

        $announcement = Announcement::create(
            $this->onlyForKind($validated) + [
                'created_by' => auth()->id(),
                'published_at' => ($validated['status'] ?? 'Draft') === 'Published' ? now() : null,
            ]
        );
        LandingCache::clearAnnouncements();

        return $this->success($announcement, 'Post created', 201);
    }

    public function update(Request $request, Announcement $announcement)
    {
        $validated = $request->validate($this->rules(false));

        if ($request->hasFile('image')) {
            if ($announcement->image_path) {
                Storage::disk('public')->delete($announcement->image_path);
            }
            $validated['image_path'] = $request->file('image')->store('news', 'public');
        }
        unset($validated['image']);

        $validated = $this->onlyForKind($validated, $announcement->category);

        /*
         * published_at is stamped the FIRST time a post goes out and never
         * again. It is the date on the post, and a correction two months
         * later does not make it new.
         */
        if (($validated['status'] ?? null) === 'Published' && ! $announcement->published_at) {
            $validated['published_at'] = now();
        }

        $announcement->update($validated);
        LandingCache::clearAnnouncements();

        return $this->success($announcement->fresh(), 'Post updated');
    }

    public function destroy(Announcement $announcement)
    {
        if ($announcement->image_path) {
            Storage::disk('public')->delete($announcement->image_path);
        }

        $announcement->delete();
        LandingCache::clearAnnouncements();

        return $this->success(null, 'Post deleted');
    }

    /**
     * Every field any kind can carry.
     *
     * They are all optional at this level because which ones apply depends on
     * the kind, and a rule set that demanded a venue would block an
     * Announcement that has no venue to give.
     */
    private function rules(bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return [
            'title' => "{$required}|string|max:255",
            'body' => "{$required}|string",
            'category' => "{$required}|in:" . implode(',', array_keys(Announcement::KINDS)),
            'status' => 'nullable|in:' . implode(',', Announcement::STATUSES),

            'author_name' => 'nullable|string|max:120',
            'excerpt' => 'nullable|string|max:300',
            'image' => 'nullable|image|max:5120',

            /* Event */
            'event_at' => 'nullable|date',
            'event_time' => 'nullable|string|max:60',
            'organizer' => 'nullable|string|max:150',
            'contact_info' => 'nullable|string|max:150',
            'registration_deadline' => 'nullable|date',

            /* Activity */
            'completed_at' => 'nullable|date',
            'participants' => 'nullable|string|max:255',

            /* Advisory */
            'effective_at' => 'nullable|date',
            'expires_at' => 'nullable|date|after_or_equal:effective_at',
            'urgency' => 'nullable|in:' . implode(',', Announcement::URGENCIES),

            /* Event, Activity and Program all use a venue. */
            'location' => 'nullable|string|max:255',
        ];
    }

    /**
     * Fields that belong to a different kind are cleared, not just ignored.
     *
     * A post changed from Event to Announcement keeps its old venue and time
     * in the database unless somebody empties them, and those stale answers
     * are exactly what the public page would render. So the kind decides what
     * the row is allowed to hold, and the rest goes to null.
     */
    private function onlyForKind(array $data, ?string $fallbackKind = null): array
    {
        $kind = $data['category'] ?? $fallbackKind;

        if ($kind === null) {
            return $data;
        }

        $allowed = Announcement::FIELDS[$kind] ?? [];

        foreach (array_unique(array_merge(...array_values(Announcement::FIELDS))) as $field) {
            if (! in_array($field, $allowed, true)) {
                $data[$field] = null;
            }
        }

        return $data;
    }
}
