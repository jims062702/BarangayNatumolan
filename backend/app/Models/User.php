<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'office',
        'is_active',
        'activated_at',
        'resident_id',
        'created_by',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        // The code is a credential in its own right — never serialise it,
        // nor the bookkeeping that tells an attacker how it is being used.
        'otp_code',
        'otp_expires_at',
        'otp_sent_at',
        'otp_attempts',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'activated_at' => 'datetime',
            'otp_expires_at' => 'datetime',
            'otp_sent_at' => 'datetime',
        ];
    }

    /** Linked resident record (portal accounts only). */
    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    public function isResident(): bool
    {
        return $this->role === 'Resident';
    }

    /*
    |--------------------------------------------------------------------------
    | Email activation (resident portal)
    |--------------------------------------------------------------------------
    | Portal accounts are created automatically when the BPO registers a
    | resident, so the account exists before anyone has proved they own the
    | mailbox. The first login sends a code there; entering it is what turns
    | the account on.
    */

    /** How long a code stays usable, and how many guesses it allows. */
    public const OTP_TTL_MINUTES = 10;
    public const OTP_MAX_ATTEMPTS = 5;

    public function isActivated(): bool
    {
        return $this->activated_at !== null;
    }

    /**
     * Issues a fresh code, replacing any outstanding one. Returns the plain
     * code so the caller can mail it — it is never readable again afterwards
     * from anywhere but this row.
     */
    public function issueActivationOtp(): string
    {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $this->forceFill([
            'otp_code' => Hash::make($code),
            'otp_expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
            'otp_sent_at' => now(),
            'otp_attempts' => 0,
        ])->save();

        return $code;
    }

    /** Whether a code was issued recently enough to still be entered. */
    public function hasLiveOtp(): bool
    {
        return $this->otp_code !== null
            && $this->otp_expires_at !== null
            && $this->otp_expires_at->isFuture();
    }

    /**
     * Checks a submitted code and, on a match, activates the account and
     * clears the code so it cannot be replayed.
     */
    public function redeemActivationOtp(string $code): bool
    {
        if (!$this->hasLiveOtp() || $this->otp_attempts >= self::OTP_MAX_ATTEMPTS) {
            return false;
        }

        if (!Hash::check($code, $this->otp_code)) {
            $this->increment('otp_attempts');

            return false;
        }

        $this->forceFill([
            'activated_at' => now(),
            'email_verified_at' => $this->email_verified_at ?? now(),
            'otp_code' => null,
            'otp_expires_at' => null,
            'otp_attempts' => 0,
        ])->save();

        return true;
    }

    /**
     * The password every portal account starts with: the resident's LAST NAME
     * followed by their birthday as MMDDYY — e.g. someone named Cruz born on
     * 27 June 2002 starts with "Cruz062702". Spaces and punctuation are
     * dropped so "Dela Cruz" produces a password that can actually be typed.
     *
     * Returns null when the record has no birthdate, which is the one case
     * where no default can be derived.
     */
    public static function defaultPortalPassword(Resident $resident): ?string
    {
        if (!$resident->birthdate) {
            return null;
        }

        $lastName = preg_replace('/[^A-Za-z0-9]/', '', (string) $resident->last_name);

        return $lastName . $resident->birthdate->format('mdy');
    }

    public function isStaff(): bool
    {
        return $this->role !== 'Resident';
    }
}
