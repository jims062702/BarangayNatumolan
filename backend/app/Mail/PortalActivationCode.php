<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The one-time code that activates a portal account. Carries the plain code,
 * which exists only for the length of this send — the row stores a hash.
 */
class PortalActivationCode extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $code,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your Barangay Natumolan verification code: ' . $this->code);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.portal-otp');
    }
}
