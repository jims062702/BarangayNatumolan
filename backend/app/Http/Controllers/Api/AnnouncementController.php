<?php

namespace App\Http\Controllers\Api;

use App\Models\Announcement;
use App\Support\LandingCache;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Staff-side announcement management (public reads happen in PublicController).
 */
class AnnouncementController extends BaseController
{
    public function index(Request $request)
    {
        $query = Announcement::with('creator:id,name');

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        return $this->success(
            $query->orderBy('sort_order')->latest('published_at')->latest('id')->paginate(15),
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
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string',
            'category' => 'required|in:News,Advisory,Event,Health,Youth',
            'location' => 'nullable|string|max:255',
            'event_at' => 'nullable|date',
            'event_time' => 'nullable|string|max:60',
            'image' => 'nullable|image|max:5120',
            'is_published' => 'boolean',
        ]);

        if ($request->hasFile('image')) {
            $validated['image_path'] = $request->file('image')->store('news', 'public');
        }
        unset($validated['image']);

        $announcement = Announcement::create($validated + [
            'created_by' => auth()->id(),
            'is_published' => $request->boolean('is_published', true),
            'published_at' => $request->boolean('is_published', true) ? now() : null,
        ]);
        LandingCache::clearAnnouncements();

        return $this->success($announcement, 'Announcement created', 201);
    }

    public function update(Request $request, Announcement $announcement)
    {
        $validated = $request->validate([
            'title' => 'string|max:255',
            'body' => 'string',
            'category' => 'in:News,Advisory,Event,Health,Youth',
            'location' => 'nullable|string|max:255',
            'event_at' => 'nullable|date',
            'event_time' => 'nullable|string|max:60',
            'image' => 'nullable|image|max:5120',
            'is_published' => 'boolean',
        ]);

        if ($request->hasFile('image')) {
            if ($announcement->image_path) {
                Storage::disk('public')->delete($announcement->image_path);
            }
            $validated['image_path'] = $request->file('image')->store('news', 'public');
        }
        unset($validated['image']);

        if ($request->has('is_published')) {
            $validated['is_published'] = $request->boolean('is_published');
            if ($validated['is_published'] && !$announcement->published_at) {
                $validated['published_at'] = now();
            }
        }

        $announcement->update($validated);
        LandingCache::clearAnnouncements();

        return $this->success($announcement, 'Announcement updated');
    }

    public function destroy(Announcement $announcement)
    {
        $announcement->delete();
        LandingCache::clearAnnouncements();

        return $this->success(null, 'Announcement deleted');
    }
}
