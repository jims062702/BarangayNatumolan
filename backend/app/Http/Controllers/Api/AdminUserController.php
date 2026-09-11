<?php

namespace App\Http\Controllers\Api;

use App\Models\Resident;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Staff account management — System Administration module.
 * Route group is gated to role Admin (office:AdminRole).
 * Resident portal accounts are created by the BPO, not here.
 */
class AdminUserController extends BaseController
{
    /*
     * These MUST match the `role` and `office` enums on the users table. When
     * they drifted apart, the form offered "Child Development Worker" / "CDC"
     * — which the database no longer accepts — while offering no SK role at
     * all, so an SK account simply could not be created. Kept in one place so
     * store() and update() can never disagree again.
     */
    public const ROLES = [
        'Punong Barangay',
        'Secretary',
        'Clerk',
        'VAWC Officer',
        'Lupon Secretary',
        'Population Worker',
        'Health Personnel',
        'SK Chairperson',
        'SK Kagawad',
        'SK Secretary',
        'Admin',
    ];

    public const OFFICES = [
        'Main Office',
        'VAWC',
        'Lupon',
        'Population',
        'Health Station',
        'SK',
        'Admin',
    ];

    public function index(Request $request)
    {
        $query = User::with('resident:id,resident_number,first_name,last_name');

        /*
         * Staff and residents are two different lists.
         *
         * Shown together, forty-odd resident accounts buried the nine staff
         * ones this screen exists to manage — and the two are looked at for
         * entirely different reasons. Staff is the default because that is
         * what somebody opening "Staff Accounts" came for.
         */
        /*
         * Never your own account.
         *
         * The server refuses a self-deactivate and a self-delete, so nothing
         * could actually go wrong — but a Deactivate button sitting on your
         * own row is a trap you only have to fall into once, and the person
         * who falls in is the one who could have undone it.
         *
         * Excluded here rather than hidden in the table, so the row cannot
         * come back the next time somebody edits that column.
         */
        $query->where('id', '!=', auth()->id());

        $kind = $request->input('kind', 'staff');

        if ($kind === 'resident') {
            $query->where('role', 'Resident');
        } elseif ($kind !== 'all') {
            $query->where('role', '!=', 'Resident');
        }

        if ($request->filled('office')) {
            $query->where('office', $request->office);
        }
        if ($request->filled('role')) {
            $query->where('role', $request->role);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%"));
        }

        $page = $query->orderBy('name')->paginate(20);

        /* Both totals travel, so the tab a clerk is NOT on can still say how
           many are waiting behind it. */
        $payload = $page->toArray();
        /* Counted the same way the list is filtered, or the tab would promise
           a row that is not there. */
        $payload['counts'] = [
            'staff' => User::where('role', '!=', 'Resident')->where('id', '!=', auth()->id())->count(),
            'resident' => User::where('role', 'Resident')->where('id', '!=', auth()->id())->count(),
        ];

        return $this->success($payload, 'Users retrieved');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
            'role' => 'required|in:' . implode(',', self::ROLES),
            'office' => 'required|in:' . implode(',', self::OFFICES),
        ]);

        $user = User::create($validated + [
            'password' => Hash::make($validated['password']),
            'is_active' => true,
            // An administrator has already verified this person, so there is
            // nothing to prove by email — only resident portal accounts,
            // which the system creates on their behalf, need activating.
            'activated_at' => now(),
            'created_by' => auth()->id(),
        ]);

        return $this->success($user, 'Staff account created', 201);
    }

    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => 'string|max:255',
            'email' => 'email|unique:users,email,' . $user->id,
            'password' => 'nullable|min:8',
            // Resident is allowed here (an existing portal account can be
            // corrected) but never in store() — those are made by the BPO.
            'role' => 'in:' . implode(',', [...self::ROLES, 'Resident']),
            'office' => 'in:' . implode(',', [...self::OFFICES, 'Resident']),
            'is_active' => 'boolean',
        ]);

        if (array_key_exists('password', $validated)) {
            if ($validated['password']) {
                $validated['password'] = Hash::make($validated['password']);
            } else {
                unset($validated['password']);
            }
        }

        if ($user->id === auth()->id() && array_key_exists('is_active', $validated) && !$validated['is_active']) {
            return $this->error('You cannot deactivate your own account', 422);
        }

        $user->update($validated);

        /* Deactivating must actually end the sessions. Left running, a
           disabled account keeps working until its token happens to age out. */
        if (array_key_exists('is_active', $validated) && ! $validated['is_active']) {
            $user->tokens()->delete();
        }

        return $this->success($user, 'Account updated');
    }

    /**
     * Work that cannot be un-attributed.
     *
     * Five columns in this database point at a user with ON DELETE RESTRICT —
     * the person who filed an ordinance, ran a health visit, gave an
     * immunisation, uploaded a VAWC document or recorded a follow-up. The
     * database will refuse to forget them, and it is right to: a health record
     * with nobody attached to it is not a record.
     *
     * Checked here rather than caught as a SQL error, so the answer is a
     * sentence a clerk can act on instead of a stack trace.
     */
    private const WORK_THAT_HOLDS = [
        ['administrative_records', 'created_by', 'administrative record'],
        ['health_visits', 'service_provider_id', 'health visit'],
        ['immunization_records', 'administered_by', 'immunisation'],
        ['vawc_documents', 'uploaded_by', 'VAWC document'],
        ['vawc_followups', 'recorded_by', 'VAWC follow-up'],
    ];

    /**
     * The non-residents on the register, whether or not they have an account.
     *
     * They are people the barangay deals with — living elsewhere, with
     * business here — and the account screens could not see them at all,
     * because none of them has an account. Listing user rows would have shown
     * an empty page and been technically correct.
     *
     * So this reads the REGISTER and reports the account beside each name.
     * Most have none; that is the fact worth being able to see.
     */
    public function nonResidents(Request $request)
    {
        $query = Resident::where('record_type', '!=', 'Resident')
            ->whereNull('merged_into_id')
            ->with(['account:id,resident_id,email,is_active,activated_at']);

        if ($request->filled('search')) {
            $query->nameSearch($request->search);
        }

        $page = $query->orderBy('last_name')->orderBy('first_name')->paginate(20);

        $page->getCollection()->transform(fn (Resident $r) => [
            'id' => $r->id,
            'resident_number' => $r->resident_number,
            'name' => $r->full_name,
            'record_type' => $r->record_type,
            'contact_number' => $r->contact_number,
            'address' => $r->address,
            /* Null where there is no portal account, which is the usual case
               and the reason this list exists at all. */
            'account' => $r->account ? [
                'id' => $r->account->id,
                'email' => $r->account->email,
                'is_active' => (bool) $r->account->is_active,
                'activated_at' => $r->account->activated_at,
            ] : null,
        ]);

        $payload = $page->toArray();
        $payload['counts'] = [
            'total' => Resident::where('record_type', '!=', 'Resident')->whereNull('merged_into_id')->count(),
            'with_account' => Resident::where('record_type', '!=', 'Resident')
                ->whereNull('merged_into_id')
                ->whereHas('account')
                ->count(),
        ];

        return $this->success($payload, 'Non-residents retrieved');
    }

    public function destroy(User $user)
    {
        if ($user->id === auth()->id()) {
            return $this->error('You cannot delete your own account.', 422);
        }

        /*
         * Resident accounts are reachable from here as well as from the
         * Population Office. Deleting one removes the PORTAL ACCOUNT, never
         * the resident: the register entry, the household, the certificates
         * all stay, and the Population Office can issue a new account for the
         * same person afterwards.
         */

        $held = [];

        foreach (self::WORK_THAT_HOLDS as [$table, $column, $noun]) {
            $count = DB::table($table)->where($column, $user->id)->count();

            if ($count > 0) {
                $held[] = $count . ' ' . $noun . ($count === 1 ? '' : 's');
            }
        }

        if ($held) {
            return $this->error(
                'This account cannot be deleted: it is attached to ' . implode(', ', $held)
                    . '. Deactivate it instead — that ends their access and keeps the records readable.',
                422,
            );
        }

        $user->tokens()->delete();
        $user->delete();

        return $this->success(null, 'Account deleted');
    }
}
