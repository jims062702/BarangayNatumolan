<?php

namespace App\Http\Controllers\Api;

use App\Models\AdministrativeRecord;
use App\Models\Notification;
use Illuminate\Http\Request;

/**
 * Barangay Administrative Records (module 1.4) — the searchable digital
 * archive of ordinances, resolutions, executive orders, memoranda, minutes,
 * committee reports, correspondence, contracts and assembly records.
 *
 * Drafting is Main Office work; adoption is the Punong Barangay's, so
 * `approve` is gated to the PB in the route table.
 */
class AdministrativeRecordController extends BaseController
{
    /** Mirrors the document_type enum on administrative_records. */
    public const DOCUMENT_TYPES = [
        'Ordinance',
        'Resolution',
        'Executive Order',
        'Memorandum',
        'Meeting Minutes',
        'Committee Report',
        'Correspondence',
        'Contract',
        'Agreement',
        'Barangay Assembly Record',
        'Other',
    ];

    public function index(Request $request)
    {
        $query = AdministrativeRecord::with(['creator:id,name', 'approver:id,name']);

        // The archive is opt-in: the working list shows current documents.
        $query->where('is_archived', $request->boolean('archived'));

        if ($request->filled('document_type')) {
            $query->where('document_type', $request->document_type);
        }

        if ($request->filled('year')) {
            $query->whereYear('document_date', $request->year);
        }

        if ($request->filled('status')) {
            $request->status === 'Approved'
                ? $query->whereNotNull('approved_at')
                : $query->whereNull('approved_at');
        }

        // Full-text-ish search across the fields a secretary actually recalls.
        if ($request->filled('search')) {
            $term = '%' . $request->search . '%';
            $query->where(function ($q) use ($term) {
                $q->where('document_number', 'like', $term)
                    ->orWhere('document_title', 'like', $term)
                    ->orWhere('summary', 'like', $term)
                    ->orWhere('document_content', 'like', $term);
            });
        }

        $records = $query->orderBy('document_date', 'desc')->orderBy('id', 'desc')->paginate(20);

        return $this->success($records, 'Administrative records retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'document_type' => 'required|in:' . implode(',', self::DOCUMENT_TYPES),
            'document_number' => 'required|string|unique:administrative_records,document_number',
            'document_title' => 'required|string|max:255',
            'document_date' => 'required|date',
            'document_content' => 'required|string',
            'summary' => 'nullable|string',
            'file_reference' => 'nullable|string|max:255',
        ]);

        $validated['created_by'] = auth()->id();

        $record = AdministrativeRecord::create($validated);

        Notification::notifyPunongBarangay(
            'administrative_record',
            'New ' . $record->document_type . ' filed',
            $record->document_number . ' — ' . $record->document_title,
            'administrative_record',
            $record->id
        );

        $record->load('creator:id,name');

        return $this->success($record, 'Administrative record created', 201);
    }

    public function show(AdministrativeRecord $administrativeRecord)
    {
        $administrativeRecord->load(['creator:id,name', 'approver:id,name']);

        return $this->success($administrativeRecord, 'Administrative record retrieved');
    }

    public function update(Request $request, AdministrativeRecord $administrativeRecord)
    {
        // An adopted document is part of the official record — reopen it by
        // filing an amending document, not by editing the text in place.
        if ($administrativeRecord->approved_at) {
            return $this->error('An approved document can no longer be edited. File an amending document instead.', 422);
        }

        $validated = $request->validate([
            'document_type' => 'sometimes|in:' . implode(',', self::DOCUMENT_TYPES),
            'document_number' => 'sometimes|string|unique:administrative_records,document_number,' . $administrativeRecord->id,
            'document_title' => 'sometimes|string|max:255',
            'document_date' => 'sometimes|date',
            'document_content' => 'sometimes|string',
            'summary' => 'nullable|string',
            'file_reference' => 'nullable|string|max:255',
        ]);

        $administrativeRecord->update($validated);
        $administrativeRecord->load(['creator:id,name', 'approver:id,name']);

        return $this->success($administrativeRecord, 'Administrative record updated');
    }

    /**
     * Delete a draft. An adopted document is part of the official record and
     * is archived, never deleted.
     */
    public function destroy(AdministrativeRecord $administrativeRecord)
    {
        if ($administrativeRecord->approved_at) {
            return $this->error(
                'An approved document is part of the official record. Archive it instead of deleting.',
                409
            );
        }

        $administrativeRecord->delete();

        return $this->success(null, 'Draft document deleted');
    }

    /** Punong Barangay adoption — stamps the approver and the date. */
    public function approve(AdministrativeRecord $administrativeRecord)
    {
        if ($administrativeRecord->approved_at) {
            return $this->error('This document is already approved.', 422);
        }

        $administrativeRecord->update([
            'approved_by' => auth()->id(),
            'approved_at' => now(),
        ]);

        $administrativeRecord->load(['creator:id,name', 'approver:id,name']);

        return $this->success($administrativeRecord, 'Document approved');
    }

    /** Moves a document into (or back out of) the archive. */
    public function archive(Request $request, AdministrativeRecord $administrativeRecord)
    {
        $validated = $request->validate(['is_archived' => 'required|boolean']);

        $administrativeRecord->update($validated);

        return $this->success(
            $administrativeRecord->fresh(),
            $validated['is_archived'] ? 'Document archived' : 'Document restored'
        );
    }

    /** Counts for the reports module and the executive dashboard. */
    public function statistics()
    {
        $records = AdministrativeRecord::all();

        return $this->success([
            'total' => $records->count(),
            'approved' => $records->whereNotNull('approved_at')->count(),
            'awaiting_approval' => $records->whereNull('approved_at')->where('is_archived', false)->count(),
            'archived' => $records->where('is_archived', true)->count(),
            'by_type' => $records->groupBy('document_type')->map->count(),
            'this_year' => $records->filter(fn ($r) => $r->document_date?->year === (int) date('Y'))->count(),
        ], 'Administrative record statistics retrieved');
    }
}
