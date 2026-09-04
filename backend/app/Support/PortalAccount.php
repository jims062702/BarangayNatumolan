<?php

namespace App\Support;

use App\Mail\PortalAccountCreated;
use App\Models\Resident;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Issues the resident portal login that now comes with every registration.
 *
 * The Population Office used to create these by hand, one resident at a
 * time, which meant most residents never got one. Registration itself is now
 * the trigger: the account is created with a known default password, and the
 * resident proves the mailbox is theirs with a one-time code the first time
 * they sign in (see User::issueActivationOtp).
 */
class PortalAccount
{
    /**
     * Creates the portal account for a freshly registered resident.
     *
     * Deliberately never throws: a mail outage or a duplicate address must
     * not lose the resident's REGISTRATION, which is the important record.
     * The caller gets back what happened so it can tell the clerk.
     *
     * @return array{created: bool, user: ?User, password: ?string, reason: ?string}
     */
    public static function provision(Resident $resident, ?int $createdBy = null): array
    {
        $skip = fn (string $reason) => ['created' => false, 'user' => null, 'password' => null, 'reason' => $reason];

        if ($resident->isNonResident()) {
            return $skip('This person does not live in the barangay, so no portal account was created — the portal is for bona fide residents.');
        }

        if (!$resident->email) {
            return $skip('No email address on file, so no portal account could be created. Add one to the record and the account will be issued.');
        }

        if (User::where('resident_id', $resident->id)->exists()) {
            return $skip('This resident already has a portal account.');
        }

        if (User::where('email', $resident->email)->exists()) {
            return $skip('That email address is already used by another account, so no portal account was created.');
        }

        $password = User::defaultPortalPassword($resident);

        if ($password === null) {
            return $skip('No birthdate on file, so the default password could not be derived.');
        }

        $user = User::create([
            'name' => $resident->full_name,
            'email' => $resident->email,
            'password' => Hash::make($password),
            'role' => 'Resident',
            'office' => 'Resident',
            'is_active' => true,
            // Stays null until the emailed code is entered — the account
            // exists, but nobody can sign in with it until then.
            'activated_at' => null,
            'resident_id' => $resident->id,
            'created_by' => $createdBy,
        ]);

        self::sendWelcome($user, $resident, $password);

        return ['created' => true, 'user' => $user, 'password' => $password, 'reason' => null];
    }

    /**
     * Tells the resident their account exists and how to get in. Mail failures
     * are logged, not raised — the clerk can always read the default password
     * off the resident's profile and pass it on at the counter.
     */
    private static function sendWelcome(User $user, Resident $resident, string $password): void
    {
        try {
            Mail::to($user->email)->send(new PortalAccountCreated($resident, $password));
        } catch (\Throwable $e) {
            Log::warning('Portal welcome email failed', [
                'resident_id' => $resident->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
