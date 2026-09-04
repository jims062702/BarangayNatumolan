<?php

namespace App\Http\Controllers\Api;

use App\Mail\PortalActivationCode;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

class AuthController extends BaseController
{
    /**
     * Register new user
     */
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8|confirmed',
            // One source of truth for both — see AdminUserController.
            'role' => 'required|in:' . implode(',', AdminUserController::ROLES),
            'office' => 'required|in:' . implode(',', AdminUserController::OFFICES),
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'office' => $validated['office'],
            'is_active' => true,
            // A staff account is created by an administrator who has already
            // verified the person, so there is nothing left to prove by email.
            'activated_at' => now(),
        ]);

        $token = $user->createToken('api_token')->plainTextToken;

        return $this->success([
            'user' => $user,
            'token' => $token,
        ], 'User registered successfully', 201);
    }

    /**
     * Login user
     */
    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => 'The provided credentials are invalid.',
            ]);
        }

        if (!$user->is_active) {
            return $this->error('User account is inactive', 403);
        }

        /*
         * A resident's portal account is created FOR them when the Population
         * Office registers them — nobody has yet proved they own the mailbox
         * it is addressed to, and the starting password (Lastname + MMDDYY)
         * is guessable by anyone who knows them. So the first sign-in is only
         * half of it: a code goes to that address, and entering it is what
         * turns the account on. No token is issued until then.
         */
        if (!$user->isActivated()) {
            return $this->success(
                $this->sendActivationCode($user) + ['requires_activation' => true, 'email' => $user->email],
                // The screen names the mailbox itself, in full; saying it
                // again here only gave the reader two versions to reconcile.
                'One more step: enter the 6-digit code we emailed you.'
            );
        }

        $token = $user->createToken('api_token')->plainTextToken;

        return $this->success([
            'user' => $user,
            'token' => $token,
        ], 'Login successful');
    }

    /**
     * Second half of the first sign-in: the emailed code.
     *
     * The password is presented again rather than a short-lived ticket from
     * the login step, so a stolen code on its own is worthless and the
     * endpoint tells an attacker nothing about which addresses exist.
     */
    public function activate(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
            'code' => 'required|string|max:10',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => 'The provided credentials are invalid.',
            ]);
        }

        if (!$user->is_active) {
            return $this->error('User account is inactive', 403);
        }

        if ($user->isActivated()) {
            // Already done — hand over a token rather than a dead end.
            return $this->success([
                'user' => $user,
                'token' => $user->createToken('api_token')->plainTextToken,
            ], 'Your account is already activated. Signed in.');
        }

        if (!$user->hasLiveOtp()) {
            return $this->error(
                'That code has expired. We have sent you a new one.',
                410,
                $this->sendActivationCode($user)
            );
        }

        if ($user->otp_attempts >= User::OTP_MAX_ATTEMPTS) {
            return $this->error(
                'Too many incorrect codes. Request a new one to try again.',
                429
            );
        }

        if (!$user->redeemActivationOtp(trim($validated['code']))) {
            $left = max(0, User::OTP_MAX_ATTEMPTS - $user->fresh()->otp_attempts);

            return $this->error(
                'That code is not correct.' . ($left > 0 ? " You have {$left} attempt(s) left." : ' Request a new code.'),
                422
            );
        }

        return $this->success([
            'user' => $user->fresh(),
            'token' => $user->createToken('api_token')->plainTextToken,
        ], 'Account activated. Welcome to the Barangay Natumolan portal!');
    }

    /** Sends another code — "I never got the email", from the sign-in page. */
    public function resendActivationCode(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => 'The provided credentials are invalid.',
            ]);
        }

        if ($user->isActivated()) {
            return $this->error('This account is already activated. Just sign in.', 422);
        }

        return $this->success(
            $this->sendActivationCode($user),
            'A new code is on its way.'
        );
    }

    /**
     * Issues and mails a code. A mail outage must not look like a wrong
     * password, so the failure is reported as its own state and the caller
     * can offer "send it again".
     *
     * @return array{otp_sent: bool, expires_in_minutes: int}
     */
    private function sendActivationCode(User $user): array
    {
        $code = $user->issueActivationOtp();
        $sent = true;

        try {
            Mail::to($user->email)->send(new PortalActivationCode($user, $code));
        } catch (\Throwable $e) {
            $sent = false;
            Log::warning('Activation code email failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }

        return ['otp_sent' => $sent, 'expires_in_minutes' => User::OTP_TTL_MINUTES];
    }

    /**
     * Get current user
     */
    public function me(Request $request)
    {
        return $this->success(auth()->user(), 'Current user retrieved');
    }

    /**
     * Logout user
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        
        return $this->success(null, 'Logout successful');
    }

    /**
     * Update user profile
     */
    public function updateProfile(Request $request)
    {
        $validated = $request->validate([
            'name' => 'string|max:255',
            'email' => 'email|unique:users,email,' . auth()->id(),
            'password' => 'nullable|min:8|confirmed',
        ]);

        $user = auth()->user();

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $user->update($validated);

        return $this->success($user, 'Profile updated successfully');
    }

    /**
     * Change password
     */
    public function changePassword(Request $request)
    {
        $validated = $request->validate([
            'current_password' => 'required',
            'new_password' => 'required|min:8|confirmed',
        ]);

        $user = auth()->user();

        if (!Hash::check($validated['current_password'], $user->password)) {
            return $this->error('Current password is incorrect', 400);
        }

        $user->update([
            'password' => Hash::make($validated['new_password']),
        ]);

        return $this->success(null, 'Password changed successfully');
    }

    /**
     * Refresh token
     */
    public function refreshToken(Request $request)
    {
        $user = auth()->user();
        $token = $user->createToken('api_token')->plainTextToken;

        return $this->success([
            'token' => $token,
        ], 'Token refreshed successfully');
    }
}
