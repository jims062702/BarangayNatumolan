<?php

namespace App\Http\Controllers\Api;

use App\Support\SequenceNumber;

use App\Models\Notification;
use App\Models\Referral;
use Illuminate\Http\Request;

/**
 * Referral & Service Coordination — the cross-office/agency referral trail
 * (Main Office, Lupon, Population, Health Station).
 *
 * VAWC referrals are deliberately NOT handled here: they live in
 * vawc_referrals behind the VAWC-only gate so survivor details never reach
 * a shared table. Per the access matrix a referral carries only the minimum
 * information the receiving office needs.
 */
class ReferralController extends BaseController
{
    /** Agencies/offices a resident can be referred to. Mirrors the enum. */
    public const RECEIVING_OFFICES = [
        'PNP WCPD',
        'DSWD',
        'Rural Health Unit',
        'Hospital',
        'Prosecutor',
        'Public Attorney',
        'Shelter',
        'Counseling',
        'Child Protection',
        'Lupon',
        'Other',
    ];

    public function index(Request $request)
    {
        $query = Referral::with(['resident:id,resident_number,first_name,middle_name,last_name,contact_number', 'serviceRequest:id,request_number,service_type']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('receiving_office')) {
            $query->where('receiving_office', $request->receiving_office);
        }

        if ($request->filled('referring_office')) {
            $query->where('referring_office', $request->referring_office);
        }

        if ($request->filled('resident_id')) {
            $query->where('resident_id', $request->resident_id);
        }

        // Follow-ups that are due or overdue — the working list for the desk.
        if ($request->boolean('due')) {
            $query->whereNotNull('followup_date')
                ->whereDate('followup_date', '<=', today())
                ->whereNotIn('status', ['Completed', 'Not Attended']);
        }

        $referrals = $query->orderBy('referral_date', 'desc')->orderBy('id', 'desc')->paginate(20);

        return $this->success($referrals, 'Referrals retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'resident_id' => 'required|exists:residents,id',
            'service_request_id' => 'nullable|exists:service_requests,id',
            'receiving_office' => 'required|in:' . implode(',', self::RECEIVING_OFFICES),
            'referral_reason' => 'required|string',
            'required_information' => 'nullable|string',
            'referral_date' => 'required|date',
            'followup_date' => 'nullable|date|after_or_equal:referral_date',
        ]);

        $validated['referral_number'] = $this->generateReferralNumber();
        $validated['referring_office'] = auth()->user()->office;
        $validated['status'] = 'Pending';

        $referral = Referral::create($validated);

        // Tell the resident where they were referred and why — the portal
        // shows this so they know which agency to visit next.
        Notification::notifyResident(
            $referral->resident_id,
            'referral',
            'You were referred to ' . $referral->receiving_office,
            'Referral ' . $referral->referral_number . ': ' . $referral->referral_reason,
            'referral',
            $referral->id
        );

        $referral->load('resident:id,resident_number,first_name,middle_name,last_name,contact_number');

        return $this->success($referral, 'Referral created', 201);
    }

    public function show(Referral $referral)
    {
        $referral->load(['resident', 'serviceRequest']);

        return $this->success($referral, 'Referral retrieved');
    }

    /**
     * Records what came back from the receiving office: acknowledgment,
     * services actually provided, the outcome, and the next follow-up.
     */
    public function update(Request $request, Referral $referral)
    {
        $validated = $request->validate([
            'status' => 'nullable|in:Pending,Acknowledged,In Progress,Completed,Not Attended',
            'acknowledgment_date' => 'nullable|date',
            'services_provided' => 'nullable|string',
            'referral_outcome' => 'nullable|string',
            'followup_date' => 'nullable|date',
            'required_information' => 'nullable|string',
        ]);

        // Acknowledging without a date stamps today — one less field at the desk.
        if (($validated['status'] ?? null) === 'Acknowledged'
            && empty($validated['acknowledgment_date'])
            && !$referral->acknowledgment_date) {
            $validated['acknowledgment_date'] = today();
        }

        $referral->update($validated);
        $referral->load('resident:id,resident_number,first_name,middle_name,last_name,contact_number');

        return $this->success($referral, 'Referral updated');
    }

    /**
     * Withdraw a referral. Only while it is still pending — once an agency
     * has acknowledged it, the exchange happened and the record stands.
     */
    public function destroy(Referral $referral)
    {
        if ($referral->acknowledgment_date || $referral->status !== 'Pending') {
            return $this->error(
                'This referral was already acknowledged or acted on, so it cannot be deleted. Close it as Not Attended instead.',
                409
            );
        }

        $referral->delete();

        return $this->success(null, 'Referral withdrawn');
    }

    /**
     * Referral coverage for the reports module — counts only, no narratives.
     */
    public function statistics(Request $request)
    {
        $month = $request->input('month', date('m'));
        $year = $request->input('year', date('Y'));

        $referrals = Referral::whereMonth('referral_date', $month)
            ->whereYear('referral_date', $year)
            ->get();

        $acknowledged = $referrals->whereNotNull('acknowledgment_date');

        return $this->success([
            'period' => ['month' => (int) $month, 'year' => (int) $year],
            'total' => $referrals->count(),
            'by_status' => $referrals->groupBy('status')->map->count(),
            'by_receiving_office' => $referrals->groupBy('receiving_office')->map->count(),
            'by_referring_office' => $referrals->groupBy('referring_office')->map->count(),
            'acknowledgment_rate' => $referrals->count() > 0
                ? round(($acknowledged->count() / $referrals->count()) * 100, 2)
                : 0,
            'pending_followups' => Referral::whereNotNull('followup_date')
                ->whereDate('followup_date', '<=', today())
                ->whereNotIn('status', ['Completed', 'Not Attended'])
                ->count(),
        ], 'Referral statistics retrieved');
    }

    /** REF-2026-00001 — one above the highest ever issued. */
    private function generateReferralNumber(): string
    {
        return SequenceNumber::next('referrals', 'referral_number', 'REF-' . date('Y') . '-', 5);
    }
}
