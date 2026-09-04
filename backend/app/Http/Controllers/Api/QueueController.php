<?php

namespace App\Http\Controllers\Api;

use App\Models\Notification;
use App\Models\OfficeQueue;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;

/**
 * Service Queue — the walk-in queue numbers issued at each office window
 * (shared core module 3, alongside requests and appointments).
 *
 * The queue is per office, per day: numbering restarts each morning so the
 * board reads "MO-0007", not a running total since installation.
 */
class QueueController extends BaseController
{
    /** Office name → queue-number prefix shown on the board. */
    private const PREFIXES = [
        'Main Office' => 'MO',
        'VAWC' => 'VW',
        'Lupon' => 'LP',
        'Population' => 'PO',
        'Health Station' => 'HS',
        'SK' => 'SK',
        'Admin' => 'AD',
    ];

    /** Waiting → Called → Serving → Completed (or Absent when not present). */
    private const OPEN_STATUSES = ['Waiting', 'Called', 'Serving'];

    /**
     * The queue board. Defaults to today and to the caller's own office —
     * the clerk opens the page and sees their window, not every office.
     */
    public function index(Request $request)
    {
        $date = $request->input('date', today()->toDateString());
        $office = $request->input('office', auth()->user()->office);

        $query = OfficeQueue::with([
            'resident:id,resident_number,first_name,middle_name,last_name',
            'serviceRequest:id,request_number,service_type,status',
            'server:id,name',
        ])->whereDate('queue_time', $date);

        if ($office !== 'All') {
            $query->where('office', $office);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $entries = $query->orderByRaw("FIELD(status, 'Serving', 'Called', 'Waiting', 'Completed', 'Absent')")
            ->orderBy('queue_time')
            ->get();

        return $this->success([
            'date' => $date,
            'office' => $office,
            'entries' => $entries,
            'summary' => $this->summaryFor($date, $office),
        ], 'Queue retrieved');
    }

    /**
     * Issues the next queue number for a service request. The request must
     * already be linked to a resident — the board calls people by name.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'service_request_id' => 'required|exists:service_requests,id',
            'notes' => 'nullable|string',
        ]);

        $serviceRequest = ServiceRequest::findOrFail($validated['service_request_id']);

        if (!$serviceRequest->resident_id) {
            return $this->error('This request has no linked resident, so it cannot be queued.', 422);
        }

        // One live number per request — re-issuing would call the same
        // person twice under two numbers.
        $existing = OfficeQueue::where('service_request_id', $serviceRequest->id)
            ->whereIn('status', self::OPEN_STATUSES)
            ->first();

        if ($existing) {
            return $this->error('This request is already in the queue as ' . $existing->queue_number . '.', 422);
        }

        $entry = OfficeQueue::create([
            'queue_number' => $this->nextQueueNumber($serviceRequest->office),
            'service_request_id' => $serviceRequest->id,
            'resident_id' => $serviceRequest->resident_id,
            'office' => $serviceRequest->office,
            'status' => 'Waiting',
            'queue_time' => now(),
            'notes' => $validated['notes'] ?? null,
        ]);

        $entry->load([
            'resident:id,resident_number,first_name,middle_name,last_name',
            'serviceRequest:id,request_number,service_type,status',
        ]);

        return $this->success($entry, 'Queue number ' . $entry->queue_number . ' issued', 201);
    }

    /** Calls the number to the window and notifies the resident. */
    public function call(OfficeQueue $queue)
    {
        if ($queue->status !== 'Waiting') {
            return $this->error('Only a waiting number can be called.', 422);
        }

        $queue->update(['status' => 'Called', 'called_time' => now()]);

        Notification::notifyResident(
            $queue->resident_id,
            'queue_called',
            'Now calling ' . $queue->queue_number,
            'Please proceed to the ' . $queue->office . ' window.',
            'office_queue',
            $queue->id
        );

        return $this->success($queue->fresh(), 'Number called');
    }

    /** Marks the start of service and records how long the resident waited. */
    public function serve(OfficeQueue $queue)
    {
        if (!in_array($queue->status, ['Waiting', 'Called'], true)) {
            return $this->error('This number is no longer waiting.', 422);
        }

        $queue->update([
            'status' => 'Serving',
            'served_time' => now(),
            'served_by' => auth()->id(),
            // Waiting time is queued → served, which is what the service
            // standard measures (not queued → completed).
            'wait_time_minutes' => (int) round($queue->queue_time->diffInMinutes(now())),
        ]);

        return $this->success($queue->fresh(), 'Now serving ' . $queue->queue_number);
    }

    public function complete(Request $request, OfficeQueue $queue)
    {
        if ($queue->status === 'Completed') {
            return $this->error('This number is already completed.', 422);
        }

        $validated = $request->validate(['notes' => 'nullable|string']);

        $queue->update([
            'status' => 'Completed',
            'completed_time' => now(),
            'served_by' => $queue->served_by ?? auth()->id(),
            'notes' => $validated['notes'] ?? $queue->notes,
        ]);

        return $this->success($queue->fresh(), 'Queue entry completed');
    }

    /** The resident did not come to the window when called. */
    public function absent(OfficeQueue $queue)
    {
        if (in_array($queue->status, ['Completed', 'Absent'], true)) {
            return $this->error('This number is already closed.', 422);
        }

        $queue->update(['status' => 'Absent', 'completed_time' => now()]);

        return $this->success($queue->fresh(), 'Marked absent');
    }

    /**
     * Removes a number issued by mistake. Only while it is still waiting —
     * once someone has been called or served, the wait time is real data the
     * service standard is measured on.
     */
    public function destroy(OfficeQueue $queue)
    {
        if ($queue->status !== 'Waiting') {
            return $this->error(
                'This number has already been called or served, so it stays on the record. Mark it Absent instead.',
                409
            );
        }

        $queue->delete();

        return $this->success(null, 'Queue number removed');
    }

    /** Counts + average wait for the board header and the reports module. */
    private function summaryFor(string $date, string $office): array
    {
        $query = OfficeQueue::whereDate('queue_time', $date);

        if ($office !== 'All') {
            $query->where('office', $office);
        }

        $entries = $query->get();

        return [
            'waiting' => $entries->where('status', 'Waiting')->count(),
            'called' => $entries->where('status', 'Called')->count(),
            'serving' => $entries->where('status', 'Serving')->count(),
            'completed' => $entries->where('status', 'Completed')->count(),
            'absent' => $entries->where('status', 'Absent')->count(),
            'now_serving' => $entries->where('status', 'Serving')->sortByDesc('served_time')->first()?->queue_number,
            'average_wait_minutes' => $entries->whereNotNull('wait_time_minutes')->count() > 0
                ? round($entries->whereNotNull('wait_time_minutes')->avg('wait_time_minutes'), 1)
                : 0,
        ];
    }

    /**
     * Next number for the office today, e.g. "MO-0007". Padded so the board
     * sorts and reads consistently.
     */
    private function nextQueueNumber(string $office): string
    {
        $prefix = self::PREFIXES[$office] ?? strtoupper(substr($office, 0, 2));

        $today = OfficeQueue::where('office', $office)
            ->whereDate('queue_time', today())
            ->count() + 1;

        return $prefix . '-' . str_pad($today, 4, '0', STR_PAD_LEFT);
    }
}
