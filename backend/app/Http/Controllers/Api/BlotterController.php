<?php

namespace App\Http\Controllers\Api;

use App\Support\SequenceNumber;

use App\Models\Blotter;
use App\Models\Resident;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The barangay blotter.
 *
 * The desk's own record of what was reported, written at the time by whoever
 * was on duty. Most entries go no further than being written down — that is
 * the point of a blotter, not a failure of one — and the few that do are
 * marked with where they went.
 */
class BlotterController extends BaseController
{
    /**
     * Words that mean this is not a blotter matter.
     *
     * Kept identical to the Lupon docket's list on purpose: an incident
     * refused by one desk and accepted by the other would defeat both.
     */
    private const VAWC_KEYWORDS = [
        'vawc', 'abuse', 'violence against', 'domestic violence', 'battery',
        'batter', 'rape', 'molest', 'maltreat', 'incest', 'trafficking',
        'child abuse', 'lascivious',
    ];

    public function index(Request $request): JsonResponse
    {
        $query = Blotter::with(['reporter:id,first_name,middle_name,last_name,suffix', 'recorder:id,name'])
            ->withCount('people');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('incident_type')) {
            $query->where('incident_type', $request->input('incident_type'));
        }

        if ($request->filled('search')) {
            $term = $request->input('search');

            /*
             * One box searching the whole entry: the number, the place, what
             * was written, and anybody named in it. A desk looking a blotter
             * up rarely has the number — they have a name and a street.
             */
            $query->where(function ($outer) use ($term) {
                $outer->where('blotter_number', 'like', "%{$term}%")
                    ->orWhere('place_of_incident', 'like', "%{$term}%")
                    ->orWhere('narrative', 'like', "%{$term}%")
                    ->orWhere('reporter_name', 'like', "%{$term}%")
                    ->orWhereHas('reporter', fn ($q) => $q->nameSearch($term))
                    ->orWhereHas('people', function ($q) use ($term) {
                        $q->where('name', 'like', "%{$term}%")
                            ->orWhereHas('resident', fn ($r) => $r->nameSearch($term));
                    });
            });
        }

        $blotters = $query->orderByDesc('recorded_at')->paginate(20);
        $blotters->getCollection()->transform(fn ($b) => $this->card($b));

        return $this->success($blotters, 'Blotter entries retrieved');
    }

    public function show(Blotter $blotter): JsonResponse
    {
        $blotter->load([
            'reporter:id,resident_number,first_name,middle_name,last_name,suffix,zone_purok,contact_number',
            'recorder:id,name,role',
            'people.resident:id,resident_number,first_name,middle_name,last_name,suffix',
            'luponCase:id,case_number,current_stage',
        ]);

        return $this->success($this->card($blotter, true), 'Blotter entry retrieved');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'incident_at' => 'nullable|date|before_or_equal:now',
            'place_of_incident' => 'required|string|max:255',
            'incident_type' => 'required|in:' . implode(',', Blotter::TYPES),
            'narrative' => 'required|string',

            // Either one of ours, or a name — never neither.
            'reporter_id' => 'nullable|required_without:reporter_name|exists:residents,id',
            'reporter_name' => 'nullable|required_without:reporter_id|string|max:150',
            'reporter_address' => 'nullable|string|max:255',
            'reporter_contact' => 'nullable|string|max:50',

            'people' => 'nullable|array',
            'people.*.role' => 'required|in:Subject,Witness',
            'people.*.resident_id' => 'nullable|exists:residents,id',
            'people.*.name' => 'nullable|string|max:150',
            'people.*.address' => 'nullable|string|max:255',
            'people.*.contact' => 'nullable|string|max:50',

            'action_taken' => 'nullable|in:' . implode(',', Blotter::ACTIONS),
            'action_notes' => 'nullable|string',
        ], [
            'reporter_id.required_without' => 'Name the person reporting, or pick them from the registry.',
            'reporter_name.required_without' => 'Pick the reporter from the registry, or type their name.',
        ]);

        if ($routed = $this->vawcRouting($validated['narrative'], $validated['incident_type'])) {
            return $routed;
        }

        foreach ($validated['people'] ?? [] as $index => $person) {
            if (empty($person['resident_id']) && empty($person['name'])) {
                return $this->error(
                    'Every person named needs either a registry record or a name.',
                    422,
                    ['people' => ["Person " . ($index + 1) . " has neither."]]
                );
            }
        }

        $blotter = DB::transaction(function () use ($validated) {
            $entry = Blotter::create([
                'blotter_number' => $this->nextNumber(),
                'recorded_at' => now(),
                'recorded_by' => auth()->id(),
                'incident_at' => $validated['incident_at'] ?? null,
                'place_of_incident' => $validated['place_of_incident'],
                'incident_type' => $validated['incident_type'],
                'narrative' => $validated['narrative'],
                // A registry link supersedes typed details, exactly as the
                // Lupon docket does: two versions of one person is one too many.
                'reporter_id' => $validated['reporter_id'] ?? null,
                'reporter_name' => empty($validated['reporter_id']) ? ($validated['reporter_name'] ?? null) : null,
                'reporter_address' => empty($validated['reporter_id']) ? ($validated['reporter_address'] ?? null) : null,
                'reporter_contact' => empty($validated['reporter_id']) ? ($validated['reporter_contact'] ?? null) : null,
                'action_taken' => $validated['action_taken'] ?? 'Recorded only',
                'action_notes' => $validated['action_notes'] ?? null,
                'status' => 'Open',
            ]);

            foreach ($validated['people'] ?? [] as $person) {
                $entry->people()->create([
                    'role' => $person['role'],
                    'resident_id' => $person['resident_id'] ?? null,
                    'name' => empty($person['resident_id']) ? ($person['name'] ?? null) : null,
                    'address' => empty($person['resident_id']) ? ($person['address'] ?? null) : null,
                    'contact' => empty($person['resident_id']) ? ($person['contact'] ?? null) : null,
                ]);
            }

            return $entry;
        });

        $blotter->load(['reporter', 'people.resident', 'recorder:id,name']);

        return $this->success(
            $this->card($blotter, true),
            'Blotter ' . $blotter->blotter_number . ' recorded.',
            201
        );
    }

    /**
     * Records what the desk did, and closes the entry when it is finished.
     *
     * The narrative is deliberately NOT editable. It is what was said on the
     * day, and a blotter that can be rewritten afterwards is worth nothing as
     * a record — corrections belong in the action notes, where they are dated
     * and attributable.
     */
    public function update(Request $request, Blotter $blotter): JsonResponse
    {
        $validated = $request->validate([
            'action_taken' => 'required|in:' . implode(',', Blotter::ACTIONS),
            'action_notes' => 'nullable|string',
            'status' => 'nullable|in:Open,Closed',
            'lupon_case_id' => 'nullable|exists:lupon_cases,id',
        ]);

        $blotter->fill([
            'action_taken' => $validated['action_taken'],
            'action_notes' => $validated['action_notes'] ?? $blotter->action_notes,
            'lupon_case_id' => $validated['lupon_case_id'] ?? $blotter->lupon_case_id,
        ]);

        if (($validated['status'] ?? null) === 'Closed' && $blotter->status !== 'Closed') {
            $blotter->status = 'Closed';
            $blotter->closed_at = now();
        } elseif (($validated['status'] ?? null) === 'Open') {
            $blotter->status = 'Open';
            $blotter->closed_at = null;
        }

        $blotter->save();
        $blotter->load(['reporter', 'people.resident', 'recorder:id,name']);

        return $this->success($this->card($blotter, true), 'Blotter entry updated');
    }

    /**
     * Refuses anything that belongs to the VAWC desk.
     *
     * Not squeamishness — the blotter is a book the whole Main Office reads,
     * and a VAWC narrative in it is a confidentiality breach under RA 9262
     * before anybody has done anything wrong. The VAWC desk keeps its own
     * records, with its own access trail, for exactly this reason.
     *
     * Mirrors the identical refusal on the Lupon docket, so an incident
     * cannot be pushed through whichever desk happens not to check.
     */
    private function vawcRouting(string $narrative, string $type): ?JsonResponse
    {
        $text = strtolower($narrative . ' ' . $type);

        foreach (self::VAWC_KEYWORDS as $keyword) {
            if (str_contains($text, $keyword)) {
                return $this->error(
                    'This report appears to involve violence against a woman or a child. '
                        . 'It must not be written into the blotter — take it to the VAWC Desk, '
                        . 'which keeps confidential records and can issue a Barangay Protection '
                        . 'Order. Under RA 9262 these matters cannot be mediated at the barangay.',
                    422,
                    ['routed_to' => 'VAWC']
                );
            }
        }

        return null;
    }

    /**
     * BLT-2026-0001.
     *
     * This one already stepped past taken numbers in a loop, so it never
     * produced a duplicate — but it started from a row COUNT, so every
     * deletion moved the start backwards into a gap and it reissued a number
     * that had already been written on paper. One above the highest ever
     * issued does not, and it is the rule the rest of the system uses.
     */
    private function nextNumber(): string
    {
        return SequenceNumber::next('blotters', 'blotter_number', 'BLT-' . date('Y') . '-', 4);
    }

    /** One entry, as the desk reads it. */
    private function card(Blotter $blotter, bool $full = false): array
    {
        $card = [
            'id' => $blotter->id,
            'blotter_number' => $blotter->blotter_number,
            'recorded_at' => $blotter->recorded_at?->toDateTimeString(),
            'recorded_by' => $blotter->recorder?->name,
            'incident_at' => $blotter->incident_at?->toDateTimeString(),
            'place_of_incident' => $blotter->place_of_incident,
            'incident_type' => $blotter->incident_type,
            'reporter' => $blotter->reporter_label,
            'reporter_id' => $blotter->reporter_id,
            'action_taken' => $blotter->action_taken,
            'status' => $blotter->status,
            'closed_at' => $blotter->closed_at?->toDateTimeString(),
            'people_count' => $blotter->people_count ?? $blotter->people()->count(),
        ];

        if (!$full) {
            return $card;
        }

        return $card + [
            'narrative' => $blotter->narrative,
            'action_notes' => $blotter->action_notes,
            'reporter_address' => $blotter->reporter_address,
            'reporter_contact' => $blotter->reporter_contact ?: $blotter->reporter?->contact_number,
            'lupon_case' => $blotter->luponCase ? [
                'id' => $blotter->luponCase->id,
                'case_number' => $blotter->luponCase->case_number,
                'stage' => $blotter->luponCase->current_stage,
            ] : null,
            'people' => $blotter->people->map(fn ($person) => [
                'id' => $person->id,
                'role' => $person->role,
                'resident_id' => $person->resident_id,
                'name' => $person->label,
                'address' => $person->address,
                'contact' => $person->contact,
            ])->values(),
        ];
    }
}
