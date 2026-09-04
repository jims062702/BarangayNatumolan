<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * The next number in a fixed-width register sequence.
 *
 * One rule: ONE ABOVE THE HIGHEST EVER ISSUED. Never a gap, never a reuse.
 *
 * Counting the rows and adding one looks like the same thing and is not. The
 * moment anything is deleted — a certificate cancelled in error, a duplicate
 * cleaned up, a test record removed — the count drops below the highest
 * number already handed out, and "count + 1" starts pointing at numbers that
 * are either taken or were taken. Two failures follow, and the quiet one is
 * far worse than the loud one:
 *
 *   - Loud: the number is still taken, the unique index rejects the insert,
 *     and a clerk gets a 500 with somebody standing at the window.
 *   - Quiet: the number is free BECAUSE the record was deleted. It is
 *     reissued to a different person — and if the first one was ever
 *     printed, two residents now hold paper bearing the same certificate
 *     number. Nothing in the system notices.
 *
 * Stepping past taken numbers fixes only the loud one. It still walks
 * BACKWARDS into gaps: with 29 certificates on file and 35 issued, the next
 * one came out CERT-2026-000030 — a document dated today, numbered below one
 * issued last week. A register whose numbers do not follow the order of
 * issue cannot be read as a register.
 *
 * So the highest number is the only thing consulted. Gaps stay gaps, which
 * is what a gap in a numbered register is supposed to mean: something was
 * issued there and is no longer on file.
 */
class SequenceNumber
{
    /**
     * @param  string  $table   e.g. 'certificates_clearances'
     * @param  string  $column  e.g. 'certificate_number'
     * @param  string  $prefix  e.g. 'CERT-2026-'
     * @param  int     $width   digits after the prefix
     */
    public static function next(string $table, string $column, string $prefix, int $width): string
    {
        /*
         * Compared as a NUMBER, not as text.
         *
         * A string MAX looks equivalent while every row is padded to the
         * same width, and this register is not: one request was recorded as
         * REQ-2026-00038, five digits where the rest have six. As text that
         * sorts ABOVE REQ-2026-000050, so the highest number came back as
         * the wrong row and the arithmetic on it produced REQ-2026-000-48 —
         * a number with a minus sign in the middle, which the unique index
         * would have accepted quite happily.
         *
         * Cutting the prefix off and casting settles it: 38 and 50 compare
         * as 38 and 50 whatever they were padded to.
         */
        $highest = DB::table($table)
            ->where($column, 'like', $prefix . '%')
            // The all-nines value is a placeholder by convention, never a
            // real record — a seeded DEMO row carrying 999999 would
            // otherwise exhaust the sequence for everybody behind it.
            ->where($column, '<>', $prefix . str_repeat('9', $width))
            ->selectRaw(
                'MAX(CAST(SUBSTRING(' . $column . ', ' . (strlen($prefix) + 1) . ') AS UNSIGNED)) AS highest'
            )
            ->value('highest');

        $sequence = ((int) $highest) + 1;

        /*
         * All-nines is the ceiling, not the last number.
         *
         * It is skipped above as a placeholder convention, so it must not be
         * issued either — a generator that refuses to COUNT a value while
         * still handing it out is contradicting itself, and the next call
         * after it would quietly start reusing.
         */
        if ($sequence >= (int) str_repeat('9', $width)) {
            /*
             * Refused, not wrapped. Running out of numbers is a real event
             * that a person has to decide about — widening the field, or
             * rolling to a new series. Silently reusing the bottom of the
             * range would put one number on two documents, which is the
             * failure this whole class exists to prevent.
             */
            throw new \RuntimeException(
                "The {$prefix} number series is exhausted at " . str_repeat('9', $width)
                . '. The numbering format has to be widened before more can be issued.'
            );
        }

        return $prefix . str_pad((string) $sequence, $width, '0', STR_PAD_LEFT);
    }
}
