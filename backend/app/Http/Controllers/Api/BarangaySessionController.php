<?php

namespace App\Http\Controllers\Api;

use App\Models\BarangaySession;
use App\Models\BarangaySessionAttendee;
use App\Support\DateWindow;
use App\Support\SequenceNumber;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The session record — the secretary's own book.
 *
 * The secretary writes it; the Punong Barangay reads it and adopts the
 * minutes. Adoption is deliberately a separate act from writing: minutes the
 * author can mark adopted are not minutes anybody approved.
 */
class BarangaySessionController extends BaseController
{
    public function index(Request $request)
    {
        $query = BarangaySession::with('recorder:id,name')
            ->withCount([
                'attendees',
                'attendees as present_count' => fn ($q) => $q->whereIn('attendance', ['Present', 'Late']),
            ]);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('session_type')) {
            $query->where('session_type', $request->session_type);
        }

        /* The same period question every other docket takes. session_date is
           a DATE, so it is compared as Manila calendar days. */
        /*
         * Counted BEFORE the window is applied, and after every other filter.
         * "Today: 3" then means three of the cases the clerk is already
         * looking at, not three in the register as a whole.
         */
        $periodCounts = DateWindow::counts($query, 'session_date', dateOnly: true);

        $window = DateWindow::fromRequest($request);
        $window?->applyTo($query, 'session_date', dateOnly: true);

        $sessions = $query->orderByDesc('session_date')->orderByDesc('id')->paginate(20);

        $payload = $sessions->toArray();
        $payload['window'] = $window?->toArray();
        $payload['years'] = DateWindow::yearsFrom(BarangaySession::min('session_date'));
        $payload['period_counts'] = $periodCounts;

        return $this->success($payload, 'Barangay sessions retrieved');
    }

    public function show(BarangaySession $barangaySession)
    {
        $barangaySession->load(['attendees', 'recorder:id,name']);

        return $this->success($barangaySession, 'Session retrieved');
    }

    public function store(Request $request)
    {
        $validated = $this->validated($request);

        $validated['session_number'] = SequenceNumber::next(
            'barangay_sessions',
            'session_number',
            'SB-' . substr($validated['session_date'], 0, 4) . '-',
            4,
        );
        $validated['recorded_by'] = auth()->id();

        $session = DB::transaction(function () use ($validated, $request) {
            $session = BarangaySession::create($validated);
            $this->writeAttendance($session, $request);

            return $session;
        });

        return $this->success($session->load('attendees'), 'Session recorded', 201);
    }

    public function update(Request $request, BarangaySession $barangaySession)
    {
        /*
         * Adopted minutes are closed.
         *
         * Once the council has adopted them the document is the barangay's
         * record, not the secretary's draft, and editing it afterwards would
         * change what the council approved without anybody voting on it.
         */
        if ($barangaySession->status === 'Adopted') {
            return $this->error('These minutes have been adopted and can no longer be edited.', 422);
        }

        $validated = $this->validated($request, $barangaySession->id);

        DB::transaction(function () use ($barangaySession, $validated, $request) {
            $barangaySession->update($validated);

            if ($request->has('attendees')) {
                $barangaySession->attendees()->delete();
                $this->writeAttendance($barangaySession, $request);
            }
        });

        return $this->success($barangaySession->fresh()->load('attendees'), 'Session updated');
    }

    /**
     * The council adopts the minutes.
     *
     * Gated to the Punong Barangay at the route. A secretary who could adopt
     * their own minutes would make the status mean nothing.
     */
    public function adopt(BarangaySession $barangaySession)
    {
        if ($barangaySession->status === 'Adopted') {
            return $this->error('Already adopted.', 422);
        }

        if (blank($barangaySession->minutes)) {
            return $this->error('There are no minutes to adopt yet.', 422);
        }

        $barangaySession->update([
            'status' => 'Adopted',
            'adopted_at' => now(),
        ]);

        return $this->success($barangaySession, 'Minutes adopted');
    }

    public function destroy(BarangaySession $barangaySession)
    {
        if ($barangaySession->status === 'Adopted') {
            return $this->error('Adopted minutes cannot be deleted.', 422);
        }

        $barangaySession->delete();

        return $this->success(null, 'Session deleted');
    }

    private function validated(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'session_type' => 'required|in:Regular,Special',
            /* Not in the future: minutes are a record of something that
               happened, and a session nobody has held has none. */
            'session_date' => 'required|date|before_or_equal:' . self::manilaToday(),
            'called_to_order_at' => 'nullable|date_format:H:i',
            'adjourned_at' => 'nullable|date_format:H:i|after:called_to_order_at',
            'venue' => 'nullable|string|max:150',
            'agenda' => 'nullable|string|max:5000',
            'minutes' => 'nullable|string|max:60000',
            'status' => 'required|in:Draft,For Approval',
            'attendees' => 'nullable|array|max:60',
            'attendees.*.name' => 'required|string|max:150',
            'attendees.*.position' => 'nullable|string|max:100',
            'attendees.*.attendance' => 'required|in:Present,Absent,Excused,Late',
            'attendees.*.remarks' => 'nullable|string|max:255',
        ], [
            'session_date.before_or_equal' => 'A session cannot be recorded before it has been held.',
            'adjourned_at.after' => 'A session cannot adjourn before it was called to order.',
        ]);
    }

    private function writeAttendance(BarangaySession $session, Request $request): void
    {
        /* The same person twice would make the present count untrue, and the
           unique index would reject the row anyway — deduplicated here so the
           clerk gets their list saved rather than a database error. */
        $seen = [];

        foreach ($request->input('attendees', []) as $row) {
            $name = trim((string) ($row['name'] ?? ''));

            if ($name === '' || isset($seen[strtolower($name)])) {
                continue;
            }

            $seen[strtolower($name)] = true;

            BarangaySessionAttendee::create([
                'barangay_session_id' => $session->id,
                'name' => $name,
                'position' => $row['position'] ?? null,
                'attendance' => $row['attendance'] ?? 'Present',
                'remarks' => $row['remarks'] ?? null,
            ]);
        }
    }
}
