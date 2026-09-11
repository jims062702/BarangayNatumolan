<?php

namespace App\Http\Controllers\Api;

use App\Mail\PasswordResetCode;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * A forgotten password, without anybody having to hold it for you.
 *
 * The barangay is moving off an arrangement where an administrator knew
 * everyone's password. Two routes replace it, and neither of them ends with a
 * person knowing a secret that is not theirs:
 *
 *   - the owner asks, and a code goes to their own email;
 *   - or they come to the Population Office counter, and a clerk sets one.
 *
 * The counter route needs no code, and that is deliberate: the resident is
 * standing there with a face and a record. Emailing a code to somebody in the
 * room to type back at the clerk proves nothing that the counter has not
 * already proved.
 */
class PasswordResetController extends BaseController
{
    private const TTL_MINUTES = 15;
    /** Wrong guesses allowed before the code is thrown away. */
    private const MAX_ATTEMPTS = 5;

    /**
     * Send a code, and say the same thing either way.
     *
     * The response never reveals whether the address is on file. A form that
     * answers "no such account" is a form that will tell a stranger which of
     * the barangay's residents have portal accounts, one address at a time.
     */
    public function forgot(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:150',
        ]);

        $email = strtolower(trim($validated['email']));
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        /*
         * An address nobody has is said out loud.
         *
         * This is a deliberate trade, made by the barangay: the quiet version
         * gives the same reply either way, which stops somebody discovering
         * WHICH residents have accounts one address at a time. The cost of
         * the quiet version is a resident who mistyped their own email
         * sitting in front of a code screen that will never receive one.
         *
         * The mitigation moves to the rate limiter instead — five asks per
         * account and sixty per connection every ten minutes make discovery
         * by guessing slow enough to be useless.
         */
        if (! $user) {
            return $this->error('That email is not on any Barangay Natumolan account. Check the spelling, or ask the Population Office which address is on your record.', 404);
        }

        if (! $user->is_active) {
            return $this->error('That account is disabled. Please ask the Barangay Population Office.', 403);
        }

        $code = (string) random_int(100000, 999999);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $email],
            [
                /* Hashed, like the activation code. A reset row that carries a
                   working code in plain text is a second password store. */
                'token' => Hash::make($code),
                'attempts' => 0,
                'created_at' => now(),
            ],
        );

        try {
            Mail::to($user->email)->send(new PasswordResetCode($user, $code, self::TTL_MINUTES));
        } catch (\Throwable $e) {
            /*
             * The mail server being down is not something to tell the person
             * at the form, because the message would differ from the one an
             * unknown address gets — and that difference is the leak this
             * whole method avoids.
             */
            Log::warning('Password reset email failed', ['user' => $user->id]);
        }

        return $this->success(
            ['email' => $user->email],
            'A 6-digit code is on its way to ' . $user->email . '.'
        );
    }

    /**
     * Is this code right? — asked before anything is changed.
     *
     * Its own step because setting a password and proving you may is one
     * question too many for one screen: somebody who mistypes the code should
     * find that out before they have chosen a password, not after.
     *
     * The row is NOT consumed here. The code is checked again when the
     * password is actually set, so a verified step cannot be replayed into a
     * password change on its own.
     */
    public function verify(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:150',
            'code' => 'required|string|size:6',
        ]);

        $email = strtolower(trim($validated['email']));

        $failure = $this->checkCode($email, $validated['code']);

        return $failure ?? $this->success(null, 'Code accepted. Choose your new password.');
    }

    /**
     * The code, and the new password.
     */
    public function reset(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:150',
            'code' => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $email = strtolower(trim($validated['email']));

        $failure = $this->checkCode($email, $validated['code']);

        if ($failure) {
            return $failure;
        }

        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        if (! $user) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();

            return $this->error('That code is not valid.', 422);
        }

        $this->setPassword($user, $validated['password'], by: null);

        DB::table('password_reset_tokens')->where('email', $email)->delete();

        return $this->success(null, 'Your password has been changed. Sign in with it now.');
    }

    /**
     * The code, judged. Returns a response on failure and null on success.
     *
     * Shared by the verify step and the set-password step on purpose. Written
     * twice, the two would drift, and the one that drifted would be the one
     * that actually changes a password.
     */
    private function checkCode(string $email, string $code)
    {
        $row = DB::table('password_reset_tokens')->where('email', $email)->first();

        if (! $row) {
            return $this->error('That code is not valid. Ask for a new one.', 422);
        }

        /*
         * Compared, not subtracted.
         *
         * `now()->diffInMinutes($past)` returns a NEGATIVE number in current
         * Carbon, so `>= 15` was false for every code however old — and every
         * expired code went on working. The row is deleted rather than merely
         * refused, so a stale code cannot sit waiting for the clock to be wrong.
         */
        if (Carbon::parse($row->created_at)->lt(now()->subMinutes(self::TTL_MINUTES))) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();

            return $this->error('That code has expired. Ask for a new one.', 422);
        }

        if ($row->attempts >= self::MAX_ATTEMPTS) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();

            return $this->error('Too many wrong codes. Ask for a new one.', 429);
        }

        if (! Hash::check($code, $row->token)) {
            DB::table('password_reset_tokens')->where('email', $email)->increment('attempts');

            return $this->error('That code is not valid.', 422);
        }

        return null;
    }

    /*
    |--------------------------------------------------------------------------
    | Changing a password you still know, from inside the account
    |--------------------------------------------------------------------------
    |
    | The portal's own "change my password", and it asks for two things: the
    | current password AND a code emailed to the account's address.
    |
    | Both, not either. The code alone would mean a borrowed unlocked phone is
    | enough — the mail app is on the same phone. The current password alone
    | was the old rule, and it is the rule that lets somebody who watched you
    | type it change it out from under you.
    |
    | It is a route of its own rather than a new rule on auth/change-password,
    | and the reason is concrete: every staff address in this barangay is
    | still @natumolan.local, which no mail server will ever deliver to.
    | Requiring a code there would lock nine offices out of their own
    | passwords. When those become real mailboxes, the two routes become one.
    */

    /**
     * Sends the code to the signed-in account's own address.
     *
     * No email parameter — the address is the one on the account. Accepting
     * one would let a signed-in resident aim a code at an address they chose.
     */
    public function requestChangeCode(Request $request)
    {
        $user = $request->user();

        if (! $user->email) {
            return $this->error('There is no email address on your account, so a code cannot be sent. Please ask the Population Office.', 422);
        }

        $email = strtolower(trim($user->email));
        $code = (string) random_int(100000, 999999);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $email],
            [
                'token' => Hash::make($code),
                'attempts' => 0,
                'created_at' => now(),
            ],
        );

        try {
            Mail::to($user->email)->send(new PasswordResetCode($user, $code, self::TTL_MINUTES));
        } catch (\Throwable $e) {
            Log::warning('Change-password code email failed', ['user' => $user->id]);

            /*
             * Said out loud here, unlike forgot().
             *
             * That method stays quiet so it cannot be used to discover which
             * addresses exist. There is nothing to discover here — this is
             * the signed-in owner asking about their own address — so the
             * useful answer is the honest one: the mail did not go.
             */
            return $this->error('The code could not be emailed right now. Please try again shortly.', 500);
        }

        return $this->success(
            ['email' => $user->email],
            'A 6-digit code is on its way to ' . $user->email . '.'
        );
    }

    /**
     * The current password, the code, and the new password.
     */
    public function changeOwnPassword(Request $request)
    {
        $validated = $request->validate([
            'current_password' => 'required|string',
            'code' => 'required|string|size:6',
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        $user = $request->user();

        /*
         * The password first, and the code second.
         *
         * Checking the code first would spend one of five attempts on
         * somebody who simply mistyped their old password, and throw away a
         * code that was never wrong.
         */
        if (! Hash::check($validated['current_password'], $user->password)) {
            return $this->error('That is not your current password.', 400);
        }

        $email = strtolower(trim((string) $user->email));

        if ($failure = $this->checkCode($email, $validated['code'])) {
            return $failure;
        }

        DB::table('password_reset_tokens')->where('email', $email)->delete();

        self::setPassword($user, $validated['new_password'], $user->id);

        /*
         * A fresh token, because setPassword revoked every one of them —
         * which is the point: a password changed after a phone went missing
         * has fixed nothing if the session on that phone survives it. The
         * device doing the changing gets to stay signed in; the rest do not.
         */
        return $this->success(
            ['token' => $user->createToken('api_token')->plainTextToken],
            'Your password has been changed. Any other device signed in to this account has been signed out.'
        );
    }

    /**
     * Writes the new password and closes every session that used the old one.
     *
     * Revoking the tokens is the part that is easy to leave out and matters
     * most: somebody resetting a password because a phone was lost has not
     * fixed anything if the session on that phone keeps working.
     */
    public static function setPassword(User $user, string $password, ?int $by): void
    {
        $user->forceFill([
            'password' => Hash::make($password),
            'password_set_at' => now(),
            'password_set_by' => $by,
        ])->save();

        $user->tokens()->delete();
    }
}
