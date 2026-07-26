<?php

namespace App\Http\Controllers\Api;

use App\Models\Official;
use App\Support\LandingCache;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Barangay + SK officials shown on the landing page — managed by SK.
 */
class OfficialController extends BaseController
{
    /** Allowed positions per group. */
    private const POSITIONS = [
        'Barangay' => ['Punong Barangay', 'Barangay Kagawad', 'Barangay Secretary', 'Barangay Treasurer'],
        'SK' => ['SK Chairperson', 'SK Kagawad', 'SK Secretary', 'SK Treasurer'],
    ];

    /** Maximum number of holders allowed per position. */
    private const LIMITS = [
        'Punong Barangay' => 1,
        'Barangay Kagawad' => 7,
        'Barangay Secretary' => 1,
        'Barangay Treasurer' => 1,
        'SK Chairperson' => 1,
        'SK Kagawad' => 7,
        'SK Secretary' => 1,
        'SK Treasurer' => 1,
    ];

    /** Sort weight used to place the head first, then kagawads, sec, treasurer. */
    private function priority(string $position): int
    {
        return match ($position) {
            'Punong Barangay', 'SK Chairperson' => 1,
            'Barangay Kagawad', 'SK Kagawad' => 2,
            'Barangay Secretary', 'SK Secretary' => 3,
            'Barangay Treasurer', 'SK Treasurer' => 4,
            default => 5,
        };
    }

    public function index(Request $request)
    {
        $query = Official::ordered();
        if ($request->filled('group')) {
            $query->where('group', $request->group);
        }

        return $this->success($query->get(), 'Officials retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'group' => 'required|in:Barangay,SK',
            'position' => 'required|string|max:150',
            'name' => 'required|string|max:150',
            'term' => 'nullable|string|max:60',
            'photo' => 'nullable|image|max:5120',
        ]);

        if (!in_array($validated['position'], self::POSITIONS[$validated['group']], true)) {
            return $this->error('That position is not valid for the selected group.', 422);
        }

        if ($error = $this->limitError($validated['group'], $validated['position'])) {
            return $this->error($error, 422);
        }

        if ($request->hasFile('photo')) {
            $validated['photo_path'] = $request->file('photo')->store('officials', 'public');
        }
        unset($validated['photo']);
        $validated['sort_order'] = $this->priority($validated['position']);
        $validated['is_active'] = true;

        $official = Official::create($validated);
        LandingCache::clearOfficials();

        return $this->success($official, 'Official added', 201);
    }

    public function update(Request $request, Official $official)
    {
        $validated = $request->validate([
            'group' => 'in:Barangay,SK',
            'position' => 'string|max:150',
            'name' => 'string|max:150',
            'term' => 'nullable|string|max:60',
            'photo' => 'nullable|image|max:5120',
        ]);

        $group = $validated['group'] ?? $official->group;
        $position = $validated['position'] ?? $official->position;

        if (!in_array($position, self::POSITIONS[$group], true)) {
            return $this->error('That position is not valid for the selected group.', 422);
        }

        if ($error = $this->limitError($group, $position, $official->id)) {
            return $this->error($error, 422);
        }

        if ($request->hasFile('photo')) {
            if ($official->photo_path) {
                Storage::disk('public')->delete($official->photo_path);
            }
            $validated['photo_path'] = $request->file('photo')->store('officials', 'public');
        }
        unset($validated['photo']);
        $validated['sort_order'] = $this->priority($position);

        $official->update($validated);
        LandingCache::clearOfficials();

        return $this->success($official, 'Official updated');
    }

    public function destroy(Official $official)
    {
        if ($official->photo_path) {
            Storage::disk('public')->delete($official->photo_path);
        }
        $official->delete();
        LandingCache::clearOfficials();

        return $this->success(null, 'Official removed');
    }

    /**
     * Returns an error message if a position has reached its holder limit,
     * otherwise null.
     */
    private function limitError(string $group, string $position, ?int $ignoreId = null): ?string
    {
        $max = self::LIMITS[$position] ?? null;
        if ($max === null) {
            return null;
        }

        $count = Official::where('group', $group)
            ->where('position', $position)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->count();

        if ($count < $max) {
            return null;
        }

        return $max === 1
            ? "There is already a {$position}. Remove the current one first, or edit that record instead."
            : "The maximum of {$max} {$position} has been reached. Remove one first to add another.";
    }
}
