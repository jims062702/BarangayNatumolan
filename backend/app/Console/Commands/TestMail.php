<?php

namespace App\Console\Commands;

use App\Mail\PortalActivationCode;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * Proves the mail settings actually deliver, and says what is wrong when they
 * do not.
 *
 * Both places that send a code swallow mail failures on purpose — an outage
 * must not look to a resident like a wrong password — so a misconfigured
 * mailbox is INVISIBLE from the app: the clerk is told a code went out, the
 * resident waits for one that was never delivered, and the only trace is a
 * line in a log nobody reads.
 *
 * Gmail fails in a handful of well-known ways, each with a fix that is
 * nothing like the others. Guessing between them from a raw SMTP exception is
 * miserable, so this names the one that happened.
 */
class TestMail extends Command
{
    protected $signature = 'mail:test
        {email : Where to send the test message}
        {--password= : Try this app password instead of the one in .env}
        {--username= : Try this mailbox instead of the one in .env}';

    protected $description = 'Send a test activation code and report exactly why it failed, if it did';

    public function handle(): int
    {
        $to = $this->argument('email');

        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error('"' . $to . '" is not an email address.');

            return self::FAILURE;
        }

        $mailer = config('mail.default');
        $smtp = config('mail.mailers.smtp');
        $from = config('mail.from.address');

        /*
         * A rejected app password is almost always fixed by generating
         * another one, and editing .env between every attempt turns a two
         * minute job into a chore. These try a candidate in place, without
         * writing it anywhere — once one works, put it in .env.
         */
        if ($override = $this->option('password')) {
            $smtp['password'] = str_replace(' ', '', $override);
        }

        if ($override = $this->option('username')) {
            $smtp['username'] = $override;
            $from = $from ?: $override;
        }

        config([
            'mail.mailers.smtp.password' => $smtp['password'],
            'mail.mailers.smtp.username' => $smtp['username'],
            'mail.from.address' => $from,
        ]);

        // The mailer is built once and cached; a changed setting needs a
        // fresh one or the old credentials are used again.
        app()->forgetInstance('mail.manager');
        \Illuminate\Support\Facades\Mail::clearResolvedInstances();

        $this->line('');
        $this->line('  Mailer .......... ' . $mailer);

        if ($mailer === 'log') {
            $this->warn('  Nothing is being sent anywhere: "log" writes the message to');
            $this->warn('  storage/logs/laravel.log. Set MAIL_MAILER=smtp in .env.');

            return self::FAILURE;
        }

        $this->line('  Host ............ ' . $smtp['host'] . ':' . $smtp['port']);
        $this->line('  Username ........ ' . ($smtp['username'] ?: '(empty)'));
        $this->line('  Password ........ ' . ($smtp['password']
            ? str_repeat('*', min(16, strlen($smtp['password'])))
                . '  (' . strlen($smtp['password']) . ' chars)'
            : '(empty)'));
        $this->line('  From ............ ' . ($from ?: '(empty)'));
        $this->line('');

        $problems = $this->settingsProblems($smtp, $from);

        if ($problems !== []) {
            foreach ($problems as $problem) {
                $this->error('  ' . $problem);
            }

            return self::FAILURE;
        }

        /*
         * A real send of a real message. A hand-rolled SMTP handshake would
         * prove the credentials and nothing about the Blade template, the
         * From header, or the transport Laravel actually builds.
         */
        $user = User::where('email', $to)->first()
            ?? new User(['name' => 'Mail test', 'email' => $to]);

        $this->line('  Sending to ' . $to . ' ...');

        try {
            Mail::to($to)->send(new PortalActivationCode($user, '123456'));
        } catch (\Throwable $e) {
            $this->line('');
            $this->error('  FAILED: ' . $e->getMessage());
            $this->line('');

            foreach ($this->diagnose($e->getMessage()) as $line) {
                $this->warn('  ' . $line);
            }

            return self::FAILURE;
        }

        $this->line('');
        $this->info('  Sent. Check ' . $to . ' - including the spam folder the first time.');
        $this->line('  The code in it is a dummy (123456); no account was touched.');
        $this->line('');

        return self::SUCCESS;
    }

    /** Things that are wrong before a connection is even worth trying. */
    private function settingsProblems(array $smtp, ?string $from): array
    {
        $problems = [];
        $isGmail = str_contains(strtolower((string) ($smtp['host'] ?? '')), 'gmail');

        if (!$smtp['username']) {
            $problems[] = 'MAIL_USERNAME is empty - put the full Gmail address in it.';
        }

        if (!$smtp['password']) {
            $problems[] = 'MAIL_PASSWORD is empty - it needs a 16-character Google app password.';
        }

        if (!$from) {
            $problems[] = 'MAIL_FROM_ADDRESS is empty - Gmail will not send without a From.';
        }

        if ($smtp['username'] && $from && strcasecmp($smtp['username'], $from) !== 0) {
            $problems[] = 'MAIL_FROM_ADDRESS (' . $from . ') is not MAIL_USERNAME ('
                . $smtp['username'] . '). Gmail only sends as the mailbox you signed in with.';
        }

        /*
         * The single commonest mistake, and one worth catching before the
         * round trip: an app password is always exactly 16 characters, so
         * anything else is the account password and will always be rejected.
         */
        if ($isGmail && $smtp['password']
            && strlen(str_replace(' ', '', $smtp['password'])) !== 16) {
            $problems[] = 'That password is ' . strlen($smtp['password']) . ' characters. A Google '
                . 'app password is exactly 16 - an account password is always refused.';
        }

        return $problems;
    }

    /** The same failures, in the words the fix is written in. */
    private function diagnose(string $error): array
    {
        $lower = strtolower($error);
        $ini = 'C:\\xampp\\php\\php.ini';
        $pem = 'C:\\xampp\\php\\extras\\ssl\\cacert.pem';

        if (str_contains($lower, 'certificate verify failed') || str_contains($lower, 'ssl routines')) {
            return [
                'This is the CA certificate bundle, not your password.',
                'XAMPP ships a list of trusted authorities that is years old, and',
                "Gmail's certificate no longer chains to anything in it.",
                '',
                'Fix: download https://curl.se/ca/cacert.pem, save it as',
                $pem . ', then set BOTH of these in ' . $ini . ':',
                '',
                '    curl.cainfo = "' . $pem . '"',
                '    openssl.cafile = "' . $pem . '"',
                '',
                'Restart Apache afterwards, then run this command again.',
            ];
        }

        if (str_contains($lower, 'username and password not accepted')
            || str_contains($lower, '535')
            || str_contains($lower, 'authentication failed')
            || str_contains($lower, 'badcredentials')) {
            return [
                'Gmail rejected the sign-in. Almost always one of:',
                '  - the account password was used instead of an app password',
                '  - 2-Step Verification is off, so no app password exists yet',
                '  - the app password was revoked, or belongs to another account',
                '',
                'Make one at myaccount.google.com/security -> 2-Step Verification',
                '-> App passwords, and paste the 16 characters with no spaces.',
            ];
        }

        if (str_contains($lower, 'connection could not be established')
            || str_contains($lower, 'connection timed out')
            || str_contains($lower, 'network is unreachable')) {
            return [
                'Nothing answered on ' . config('mail.mailers.smtp.host') . ':'
                    . config('mail.mailers.smtp.port') . '.',
                'Some networks block outbound SMTP. Try port 465 with MAIL_SCHEME=smtps,',
                'or another connection to rule the network out.',
            ];
        }

        if (str_contains($lower, 'from address') || str_contains($lower, 'sender address')) {
            return [
                'Gmail refused the From header. It has to be the same mailbox as',
                'MAIL_USERNAME - Gmail will not send as an address it does not own.',
            ];
        }

        return [
            'Not a failure this command recognises. The message above is',
            'verbatim from the mail server; the full trace is in',
            'storage/logs/laravel.log.',
        ];
    }
}
