<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Gates a route group to specific offices/roles.
 *
 * Usage: middleware('office:VAWC') or middleware('office:Lupon,PB').
 * Entries are office names ("Main Office", "VAWC", "Lupon", "Population",
 * "Health Station", "SK", "Admin") plus two role shortcuts:
 *   PB        → role "Punong Barangay"
 *   AdminRole → role "Admin"
 *
 * IMPORTANT: there is deliberately NO blanket PB/Admin bypass. Confidential
 * areas (VAWC, Health) list only their own office, per the access matrix.
 */
class OfficeMiddleware
{
    public function handle(Request $request, Closure $next, string ...$allowed)
    {
        $user = auth()->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        foreach ($allowed as $entry) {
            if ($entry === 'PB' && $user->role === 'Punong Barangay') {
                return $next($request);
            }
            if ($entry === 'AdminRole' && $user->role === 'Admin') {
                return $next($request);
            }
            if ($entry === 'ResidentRole' && $user->role === 'Resident' && $user->resident_id) {
                return $next($request);
            }
            if ($user->office === $entry && $user->role !== 'Resident') {
                return $next($request);
            }
        }

        return response()->json([
            'success' => false,
            'message' => 'This action is unauthorized for your office.',
        ], 403);
    }
}
