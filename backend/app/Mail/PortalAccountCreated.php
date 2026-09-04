<?php

namespace App\Mail;

use App\Models\Resident;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Sent the moment a resident is registered and their portal login is issued. */
class PortalAccountCreated extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Resident $resident,
        public string $password,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your Barangay Natumolan portal account is ready');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.portal-account');
    }
}
