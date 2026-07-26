<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Blocks resident portal accounts from staff endpoints.
 * Residents use the /api/portal/* routes only.
 */
class StaffMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $user = auth()->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        if ($user->role === 'Resident') {
            return response()->json([
                'success' => false,
                'message' => 'Staff access only. Please use the resident portal.',
            ], 403);
        }

        return $next($request);
    }
}
