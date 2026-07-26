<?php

namespace App\Http\Controllers\Api;

use App\Models\HeroSlide;
use App\Support\LandingCache;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Home-section carousel pictures — managed by the SK office.
 */
class HeroSlideController extends BaseController
{
    public function index()
    {
        return $this->success(
            HeroSlide::orderBy('sort_order')->orderBy('id')->get(),
            'Hero slides retrieved'
        );
    }

    /** Reorder slides (first id = shown first). */
    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:hero_slides,id',
        ]);

        foreach ($validated['ids'] as $index => $id) {
            HeroSlide::where('id', $id)->update(['sort_order' => $index]);
        }
        LandingCache::clearHeroSlides();

        return $this->success(null, 'Order updated');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'subtitle' => 'nullable|string|max:255',
            'image' => 'required|image|max:5120', // 5MB
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ]);

        $path = $request->file('image')->store('heroes', 'public');

        $slide = HeroSlide::create([
            'title' => $validated['title'] ?? null,
            'subtitle' => $validated['subtitle'] ?? null,
            'image_path' => $path,
            'sort_order' => $validated['sort_order'] ?? 0,
            'is_active' => $request->boolean('is_active', true),
            'created_by' => auth()->id(),
        ]);
        LandingCache::clearHeroSlides();

        return $this->success($slide, 'Hero slide added', 201);
    }

    public function update(Request $request, HeroSlide $heroSlide)
    {
        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'subtitle' => 'nullable|string|max:255',
            'image' => 'nullable|image|max:5120',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ]);

        if ($request->hasFile('image')) {
            if ($heroSlide->image_path) {
                Storage::disk('public')->delete($heroSlide->image_path);
            }
            $validated['image_path'] = $request->file('image')->store('heroes', 'public');
        }
        unset($validated['image']);

        if ($request->has('is_active')) {
            $validated['is_active'] = $request->boolean('is_active');
        }

        $heroSlide->update($validated);
        LandingCache::clearHeroSlides();

        return $this->success($heroSlide, 'Hero slide updated');
    }

    public function destroy(HeroSlide $heroSlide)
    {
        if ($heroSlide->image_path) {
            Storage::disk('public')->delete($heroSlide->image_path);
        }
        $heroSlide->delete();
        LandingCache::clearHeroSlides();

        return $this->success(null, 'Hero slide deleted');
    }
}
