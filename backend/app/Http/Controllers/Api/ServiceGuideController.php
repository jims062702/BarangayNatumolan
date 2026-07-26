<?php

namespace App\Http\Controllers\Api;

use App\Models\ServiceGuide;
use Illuminate\Http\Request;

/**
 * Knowledge-base management for the AI-assisted service guide.
 */
class ServiceGuideController extends BaseController
{
    public function index(Request $request)
    {
        $query = ServiceGuide::query();

        if ($request->filled('office')) {
            $query->where('office', $request->office);
        }

        return $this->success($query->orderBy('office')->orderBy('service_name')->paginate(30), 'Service guides retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'office' => 'required|string|max:100',
            'service_name' => 'required|string|max:150',
            'description' => 'required|string',
            'requirements' => 'nullable|string',
            'fees' => 'nullable|string|max:120',
            'schedule' => 'nullable|string|max:120',
            'keywords' => 'nullable|string|max:255',
            'is_active' => 'boolean',
        ]);

        $guide = ServiceGuide::create($validated);

        return $this->success($guide, 'Service guide created', 201);
    }

    public function update(Request $request, ServiceGuide $serviceGuide)
    {
        $validated = $request->validate([
            'office' => 'string|max:100',
            'service_name' => 'string|max:150',
            'description' => 'string',
            'requirements' => 'nullable|string',
            'fees' => 'nullable|string|max:120',
            'schedule' => 'nullable|string|max:120',
            'keywords' => 'nullable|string|max:255',
            'is_active' => 'boolean',
        ]);

        $serviceGuide->update($validated);

        return $this->success($serviceGuide, 'Service guide updated');
    }

    public function destroy(ServiceGuide $serviceGuide)
    {
        $serviceGuide->delete();

        return $this->success(null, 'Service guide deleted');
    }
}
