<?php

namespace App\Support;

/**
 * Reading a spreadsheet the office saved out of Excel, without a library.
 *
 * The write side of this (see Xlsx) makes the simplest file that is still a
 * valid one. Reading is harder, because the file did not come from us: Excel
 * compresses its entries, keeps every piece of text in one shared table, and
 * stores dates as numbers whose meaning lives in a separate styles part. A
 * reader that ignores any of those gets numbers where the birthdates should
 * be — and a birthdate silently imported as 45678 is worse than an import
 * that refused.
 *
 * So this does four things: unzip, resolve the shared strings, work out which
 * cells are formatted as dates, and put the blanks back where the sheet
 * skipped them.
 */
class XlsxReader
{
    /** Excel's own numbering for the date and time formats it ships with. */
    private const DATE_FORMATS = [
        14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
        45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
    ];

    /**
     * Every row of the first sheet, as arrays of strings.
     *
     * Shaped exactly like fgetcsv gives them, so the import can read either
     * kind of file the same way.
     *
     * @return array<int, array<int, string>>
     */
    public static function rows(string $path): array
    {
        $parts = self::unzip($path);

        if (! isset($parts['xl/workbook.xml'])) {
            throw new \RuntimeException('That file is not a spreadsheet.');
        }

        $sheetPath = self::firstSheetPath($parts);

        if (! isset($parts[$sheetPath])) {
            throw new \RuntimeException('That spreadsheet has no readable sheet.');
        }

        $strings = self::sharedStrings($parts['xl/sharedStrings.xml'] ?? null);
        $dateStyles = self::dateStyles($parts['xl/styles.xml'] ?? null);
        $epoch1904 = str_contains($parts['xl/workbook.xml'], 'date1904="1"')
            || str_contains($parts['xl/workbook.xml'], "date1904='1'");

        return self::sheet($parts[$sheetPath], $strings, $dateStyles, $epoch1904);
    }

    /* ------------------------------------------------------------------
     | The sheet
     * ---------------------------------------------------------------- */

    /**
     * @param array<int, string> $strings
     * @param array<int, bool> $dateStyles
     * @return array<int, array<int, string>>
     */
    private static function sheet(
        string $xml,
        array $strings,
        array $dateStyles,
        bool $epoch1904
    ): array {
        $previous = libxml_use_internal_errors(true);
        $sheet = simplexml_load_string($xml);
        libxml_use_internal_errors($previous);

        if ($sheet === false || ! isset($sheet->sheetData)) {
            throw new \RuntimeException('That spreadsheet could not be read.');
        }

        $rows = [];

        foreach ($sheet->sheetData->row as $row) {
            $cells = [];
            $widest = -1;

            foreach ($row->c as $cell) {
                /*
                 * The column comes from the cell's own reference, not from
                 * its position. Excel leaves empty cells out entirely, so
                 * counting them in order shifts every value after the first
                 * blank into the wrong column.
                 */
                $index = self::columnIndex((string) $cell['r']);
                $cells[$index] = self::value($cell, $strings, $dateStyles, $epoch1904);
                $widest = max($widest, $index);
            }

            $line = [];
            for ($i = 0; $i <= $widest; $i++) {
                $line[] = $cells[$i] ?? '';
            }

            $rows[] = $line;
        }

        return $rows;
    }

    /**
     * @param array<int, string> $strings
     * @param array<int, bool> $dateStyles
     */
    private static function value(
        \SimpleXMLElement $cell,
        array $strings,
        array $dateStyles,
        bool $epoch1904
    ): string {
        $type = (string) $cell['t'];

        /* Text kept in the workbook's shared table — Excel's usual choice. */
        if ($type === 's') {
            return $strings[(int) $cell->v] ?? '';
        }

        /* Text written into the cell itself, which is what our own writer does. */
        if ($type === 'inlineStr') {
            return self::flatten($cell->is);
        }

        /* A formula's cached result, already a string. */
        if ($type === 'str') {
            return (string) $cell->v;
        }

        if (! isset($cell->v) || (string) $cell->v === '') {
            return '';
        }

        $raw = (string) $cell->v;

        /*
         * A date is a number until the style says otherwise. Left alone, a
         * birthdate imports as 45678 — which validates, saves, and is wrong
         * in a way nobody notices until somebody's age is four hundred.
         */
        if (is_numeric($raw) && ($dateStyles[(int) ($cell['s'] ?? 0)] ?? false)) {
            return self::dateFromSerial((float) $raw, $epoch1904);
        }

        return $raw;
    }

    /**
     * Excel counts days from the start of 1900, and believes 1900 was a leap
     * year. Offsetting from the Unix epoch by 25569 days absorbs both, which
     * is why the arithmetic looks arbitrary.
     */
    private static function dateFromSerial(float $serial, bool $epoch1904): string
    {
        $offset = $epoch1904 ? 24107 : 25569;
        $seconds = (int) round(($serial - $offset) * 86400);

        return gmdate('Y-m-d', $seconds);
    }

    /** "BC7" → 80. The row number is ignored. */
    private static function columnIndex(string $reference): int
    {
        $index = 0;

        foreach (str_split(strtoupper($reference)) as $character) {
            if ($character < 'A' || $character > 'Z') {
                break;
            }
            $index = $index * 26 + (ord($character) - 64);
        }

        return max(0, $index - 1);
    }

    /* ------------------------------------------------------------------
     | The parts that give a cell its meaning
     * ---------------------------------------------------------------- */

    /** @return array<int, string> */
    private static function sharedStrings(?string $xml): array
    {
        if ($xml === null) {
            return [];
        }

        $previous = libxml_use_internal_errors(true);
        $table = simplexml_load_string($xml);
        libxml_use_internal_errors($previous);

        if ($table === false) {
            return [];
        }

        $strings = [];

        foreach ($table->si as $item) {
            $strings[] = self::flatten($item);
        }

        return $strings;
    }

    /**
     * One string out of an <si> or an <is>.
     *
     * A run of differently-formatted text is split into several <r><t> parts,
     * and a name half in bold arrives as two of them. Joined, or the surname
     * is lost.
     */
    private static function flatten(?\SimpleXMLElement $node): string
    {
        if ($node === null) {
            return '';
        }

        if (isset($node->r)) {
            $text = '';
            foreach ($node->r as $run) {
                $text .= (string) $run->t;
            }

            return $text;
        }

        return (string) $node->t;
    }

    /**
     * Which style indices mean "this cell is a date".
     *
     * @return array<int, bool>
     */
    private static function dateStyles(?string $xml): array
    {
        if ($xml === null) {
            return [];
        }

        $previous = libxml_use_internal_errors(true);
        $styles = simplexml_load_string($xml);
        libxml_use_internal_errors($previous);

        if ($styles === false) {
            return [];
        }

        /*
         * A workbook can define its own formats on top of the built-in ones.
         * The code is read rather than the id: "dd/mm/yyyy" is a date
         * whatever number it was filed under.
         */
        $custom = [];

        if (isset($styles->numFmts)) {
            foreach ($styles->numFmts->numFmt as $format) {
                $custom[(int) $format['numFmtId']] = self::looksLikeADate((string) $format['formatCode']);
            }
        }

        $isDate = [];
        $index = 0;

        if (isset($styles->cellXfs)) {
            foreach ($styles->cellXfs->xf as $xf) {
                $id = (int) $xf['numFmtId'];
                $isDate[$index] = $custom[$id] ?? in_array($id, self::DATE_FORMATS, true);
                $index++;
            }
        }

        return $isDate;
    }

    /**
     * A format code that puts a date on screen.
     *
     * Quoted text and colour or condition brackets are dropped first: a
     * currency format like [$₱-409]#,##0.00 has a d in its label and is not
     * a date.
     */
    private static function looksLikeADate(string $code): bool
    {
        $bare = preg_replace(['/"[^"]*"/', '/\[[^\]]*\]/', '/\\\\./'], '', $code) ?? $code;

        return (bool) preg_match('/[dy]/i', $bare);
    }

    /** Where the first sheet's XML lives, which is not always sheet1.xml. */
    private static function firstSheetPath(array $parts): string
    {
        $rels = $parts['xl/_rels/workbook.xml.rels'] ?? '';

        $previous = libxml_use_internal_errors(true);
        $workbook = simplexml_load_string($parts['xl/workbook.xml']);
        $relationships = $rels === '' ? false : simplexml_load_string($rels);
        libxml_use_internal_errors($previous);

        if ($workbook !== false && $relationships !== false && isset($workbook->sheets->sheet)) {
            $id = (string) $workbook->sheets->sheet[0]
                ->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];

            foreach ($relationships->Relationship as $relationship) {
                if ((string) $relationship['Id'] === $id) {
                    $target = ltrim((string) $relationship['Target'], '/');

                    return str_starts_with($target, 'xl/') ? $target : 'xl/' . $target;
                }
            }
        }

        return 'xl/worksheets/sheet1.xml';
    }

    /* ------------------------------------------------------------------
     | The ZIP, read by hand
     * ---------------------------------------------------------------- */

    /**
     * Every entry in the archive, by name.
     *
     * ZipArchive would do this in three lines, and the `zip` extension it
     * needs is switched off here — so the central directory is walked
     * directly. Only the two compression methods a spreadsheet actually uses
     * are supported: stored, and deflate.
     *
     * @return array<string, string>
     */
    private static function unzip(string $path): array
    {
        $bytes = file_get_contents($path);

        if ($bytes === false || strlen($bytes) < 22) {
            throw new \RuntimeException('That file could not be read.');
        }

        /*
         * The end-of-central-directory record is at the very end unless the
         * archive carries a comment, so the last 64KB is searched backwards.
         */
        $end = strrpos(substr($bytes, -65557), "PK\x05\x06");

        if ($end === false) {
            throw new \RuntimeException('That file is not a spreadsheet.');
        }

        $end += max(0, strlen($bytes) - 65557);
        $eocd = unpack('vdisk/vstart/vhere/vtotal/Vsize/Voffset', substr($bytes, $end + 4, 18));

        $parts = [];
        $at = $eocd['offset'];

        for ($i = 0; $i < $eocd['total']; $i++) {
            if (substr($bytes, $at, 4) !== "PK\x01\x02") {
                break;
            }

            $entry = unpack(
                'vmade/vneed/vflags/vmethod/vtime/vdate/Vcrc/Vcompressed/Vsize'
                . '/vnamelen/vextralen/vcommentlen/vdisk/vinternal/Vexternal/Vlocal',
                substr($bytes, $at + 4, 42)
            );

            $name = substr($bytes, $at + 46, $entry['namelen']);
            $at += 46 + $entry['namelen'] + $entry['extralen'] + $entry['commentlen'];

            /* The LOCAL header's name and extra lengths can differ from the
               central one's, so the data offset is read from there. */
            $local = unpack('vnamelen/vextralen', substr($bytes, $entry['local'] + 26, 4));
            $start = $entry['local'] + 30 + $local['namelen'] + $local['extralen'];
            $data = substr($bytes, $start, $entry['compressed']);

            if ($entry['method'] === 8) {
                $data = @gzinflate($data);
            } elseif ($entry['method'] !== 0) {
                /* Something exotic — skip it rather than return rubbish. */
                continue;
            }

            if ($data === false) {
                continue;
            }

            $parts[$name] = $data;
        }

        return $parts;
    }
}
