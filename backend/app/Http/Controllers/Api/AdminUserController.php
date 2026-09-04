<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Http\Request;
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

        return $this->success($query->orderBy('name')->paginate(20), 'Users retrieved');
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

        return $this->success($user, 'Account updated');
    }
}
