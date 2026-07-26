<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Blocks specific roles from a route group.
 * Usage: ->middleware('deny_role:Clerk')
 */
class DenyRoleMiddleware
{
    public function handle(Request $request, Closure $next, ...$roles)
    {
        $user = auth()->user();

        if ($user && in_array($user->role, $roles, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Your role does not have access to this section.',
            ], 403);
        }

        return $next($request);
    }
}
