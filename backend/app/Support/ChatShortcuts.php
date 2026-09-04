<?php

namespace App\Support;

use App\Models\Official;
use App\Models\ServiceGuide;

/**
 * The answers the live desk keeps having to give, ready to insert.
 *
 * A resident asks what an indigency certificate needs and the Secretary types
 * the same four requirements they typed yesterday. Typed from memory they
 * come out slightly different every time — one visitor is told about the
 * cashier, the next is not — and every one of those answers is already
 * written down in the service guides the office maintains.
 *
 * So the desk gets shortcuts: `@certificate/indigency` becomes the real
 * requirements, `@officials/barangaysecretary` becomes the real name. The
 * text is pulled from the same tables the public website reads, which means
 * correcting a guide corrects what the desk says from that moment on. Nothing
 * here is a second copy of anything.
 *
 * Expansions are inserted into the composer as ordinary text, not sent as
 * they are: the Secretary still reads them, and still adds the sentence that
 * belongs to this particular visitor.
 */
class ChatShortcuts
{
    /** Everything the composer offers, in the order it should be browsed. */
    public static function all(): array
    {
        return array_merge(self::services(), self::officials());
    }

    /**
     * Requirements, fees and hours for every service the barangay publishes.
     *
     * Filed under `certificate/` because that is the word the desk reaches
     * for, even where the guide is a consultation rather than a certificate —
     * the list is browsed by its real names, not by the prefix.
     */
    private static function services(): array
    {
        $used = [];

        return ServiceGuide::where('is_active', true)
            ->orderBy('office')
            ->orderBy('service_name')
            ->get()
            ->map(function (ServiceGuide $guide) use (&$used) {
                $slug = self::unique(self::slug($guide->service_name), $used);

                return [
                    'slug' => 'certificate/' . $slug,
                    'group' => 'Certificates & services',
                    'label' => $guide->service_name,
                    'hint' => trim($guide->office . ($guide->fees ? ' · ' . $guide->fees : '')),
                    // Matched by the composer's search as well as the label,
                    // so "indigent" finds the indigency guide.
                    'keywords' => trim($guide->keywords . ' ' . $guide->office),
                    'body' => self::guideBody($guide),
                ];
            })
            ->values()
            ->all();
    }

    /** One service guide, written out the way the desk would say it. */
    private static function guideBody(ServiceGuide $guide): string
    {
        $lines = [$guide->service_name . ' — ' . $guide->office];

        if ($guide->description) {
            $lines[] = '';
            $lines[] = $guide->description;
        }

        $requirements = self::bullets($guide->requirements);

        if ($requirements !== []) {
            $lines[] = '';
            $lines[] = 'What to bring:';

            foreach ($requirements as $requirement) {
                $lines[] = '• ' . $requirement;
            }
        }

        if ($guide->fees) {
            $lines[] = '';
            $lines[] = 'Fee: ' . $guide->fees;
        }

        if ($guide->schedule) {
            $lines[] = ($guide->fees ? '' : PHP_EOL) . 'Available: ' . $guide->schedule;
        }

        return trim(implode(PHP_EOL, $lines));
    }

    /**
     * The roster, three ways: each office holder, each position that several
     * people hold, and each whole group.
     *
     * A visitor asking "sino ang secretary?" wants one name; one asking "sino
     * ang mga kagawad?" wants all seven. Both are one keystroke here.
     */
    private static function officials(): array
    {
        $officials = Official::where('is_active', true)->orderBy('sort_order')->get();

        if ($officials->isEmpty()) {
            return [];
        }

        $shortcuts = [];
        $byPosition = $officials->groupBy('position');

        foreach ($byPosition as $position => $holders) {
            $slug = self::slug($position);

            if ($holders->count() === 1) {
                $shortcuts[] = self::officialShortcut($slug, $position, $holders->first());
                continue;
            }

            /*
             * Seven kagawads cannot share one slug. The position answers with
             * the whole bench — the commoner question — and each member is
             * reachable by surname underneath it.
             */
            $shortcuts[] = [
                'slug' => 'officials/' . $slug,
                'group' => 'Officials',
                'label' => $position . ' (all ' . $holders->count() . ')',
                'hint' => $holders->first()->group . ' · everyone holding this seat',
                'keywords' => $position,
                'body' => $position . ':' . PHP_EOL
                    . $holders->map(fn ($o) => '• ' . $o->name)->implode(PHP_EOL),
            ];

            foreach ($holders as $holder) {
                $shortcuts[] = self::officialShortcut(
                    $slug . '-' . self::slug(self::surname($holder->name)),
                    $position,
                    $holder
                );
            }
        }

        // And each whole group, for "sino ang mga opisyal ng barangay?"
        foreach ($officials->groupBy('group') as $group => $members) {
            $shortcuts[] = [
                'slug' => 'officials/' . self::slug($group),
                'group' => 'Officials',
                'label' => $group . ' officials (all ' . $members->count() . ')',
                'hint' => 'The whole roster',
                'keywords' => $group . ' officials roster',
                'body' => $group . ' officials:' . PHP_EOL
                    . $members->map(fn ($o) => '• ' . $o->position . ' — ' . $o->name)->implode(PHP_EOL),
            ];
        }

        return $shortcuts;
    }

    private static function officialShortcut(string $slug, string $position, Official $official): array
    {
        return [
            'slug' => 'officials/' . $slug,
            'group' => 'Officials',
            'label' => $position . ' — ' . $official->name,
            'hint' => $official->group . ($official->term ? ' · ' . $official->term : ''),
            'keywords' => $official->name . ' ' . $position . ' ' . $official->group,
            'body' => $position . ': ' . $official->name
                . ($official->term ? ' (' . $official->term . ')' : ''),
        ];
    }

    /**
     * "Ms. Liezel A. Fernandez" -> "Fernandez".
     *
     * Filipino surnames carry particles — Dela Cruz, Delos Santos, San
     * Juan — and taking only the last word turns Dela Cruz into Cruz,
     * which is a different family entirely.
     */
    private static function surname(string $name): string
    {
        $parts = preg_split('/\s+/', trim($name), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        if ($parts === []) {
            return $name;
        }

        $particles = ['dela', 'delas', 'delos', 'de', 'del', 'san', 'santa', 'sta', 'da', 'di'];
        $i = count($parts) - 1;

        while ($i > 0 && in_array(strtolower(rtrim($parts[$i - 1], '.')), $particles, true)) {
            $i--;
        }

        return implode(' ', array_slice($parts, $i));
    }

    /**
     * A short, typeable handle.
     *
     * "Certificate of Indigency" has to become `indigency`, not
     * `certificateofindigency` — the prefix already said certificate, and
     * saying it twice is what makes a shortcut slower than typing the answer.
     */
    private static function slug(string $text): string
    {
        $text = (string) preg_replace('/\(.*?\)/', '', $text);        // (Dispute Settlement)
        $text = preg_split('/\s*&\s*/', $text)[0];                    // "… & Portal Account"
        $text = trim($text);
        $text = (string) preg_replace('/^certificat(e|ion)\s+of\s+/i', '', $text);
        $text = (string) preg_replace('/\s+certificat(e|ion)s?$/i', '', $text);

        return (string) preg_replace('/[^a-z0-9]/', '', strtolower($text));
    }

    /** Keeps two guides from claiming the same handle. */
    private static function unique(string $slug, array &$used): string
    {
        $slug = $slug !== '' ? $slug : 'item';
        $candidate = $slug;
        $n = 1;

        while (in_array($candidate, $used, true)) {
            $candidate = $slug . '-' . (++$n);
        }

        $used[] = $candidate;

        return $candidate;
    }

    /**
     * "Valid ID, proof of residency" -> two bullets.
     *
     * Guides are written by the offices themselves, in whatever shape suits
     * them: some use commas, some semicolons, some one per line. All three
     * have to come out as a list a visitor can read.
     */
    private static function bullets(?string $text): array
    {
        if (!$text) {
            return [];
        }

        $parts = preg_split('/\s*(?:[\r\n]+|;|,)\s*/', trim($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_filter(array_map(
            fn ($part) => ucfirst(trim($part, " \t\n\r\0\x0B-•")),
            $parts
        )));
    }
}
