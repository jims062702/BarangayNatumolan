<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Enforces a unique resident email at the database level so a duplicate can
 * never slip in (keeping portal-account creation collision-free). Nullable
 * email is kept — MySQL allows many NULLs under a unique index, so residents
 * without an email on file are unaffected.
 *
 * Any pre-existing duplicate non-null emails are resolved first: the rightful
 * owner (the resident whose portal account uses that email) keeps it; the
 * others fall back to their own portal email if it is free, else it is cleared.
 */
return new class extends Migration
{
    public function up(): void
    {
        $dupeEmails = DB::table('residents')
            ->whereNotNull('email')
            ->where('email', '!=', '')
            ->groupBy('email')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('email');

        foreach ($dupeEmails as $email) {
            $rows = DB::table('residents as r')
                ->leftJoin('users as u', 'u.resident_id', '=', 'r.id')
                ->where('r.email', $email)
                ->orderBy('r.id')
                ->get(['r.id', 'u.email as portal_email']);

            // Owner = whoever's portal login matches this email; else the first.
            $owner = $rows->first(
                fn ($x) => $x->portal_email && strtolower($x->portal_email) === strtolower($email)
            ) ?? $rows->first();

            foreach ($rows as $row) {
                if ($row->id === $owner->id) {
                    continue;
                }

                $replacement = null;
                if ($row->portal_email
                    && strtolower($row->portal_email) !== strtolower($email)
                    && !DB::table('residents')->where('email', $row->portal_email)->exists()) {
                    $replacement = $row->portal_email;
                }

                DB::table('residents')->where('id', $row->id)->update(['email' => $replacement]);
            }
        }

        Schema::table('residents', function (Blueprint $table) {
            $table->unique('email');
        });
    }

    public function down(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->dropUnique(['email']);
        });
    }
};
