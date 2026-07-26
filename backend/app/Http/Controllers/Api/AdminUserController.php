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
            'role' => 'required|in:Punong Barangay,Secretary,Clerk,VAWC Officer,Lupon Secretary,Population Worker,Health Personnel,Child Development Worker,Admin',
            'office' => 'required|in:Main Office,VAWC,Lupon,Population,Health Station,CDC,Admin',
        ]);

        $user = User::create($validated + [
            'password' => Hash::make($validated['password']),
            'is_active' => true,
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
            'role' => 'in:Punong Barangay,Secretary,Clerk,VAWC Officer,Lupon Secretary,Population Worker,Health Personnel,Child Development Worker,Admin,Resident',
            'office' => 'in:Main Office,VAWC,Lupon,Population,Health Station,CDC,Admin,Resident',
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
