<?php

namespace App\Support;

/**
 * A spreadsheet the office can open in Excel, written without a library.
 *
 * An .xlsx file is a ZIP of small XML parts, and that is all this builds. The
 * usual answer is PhpSpreadsheet, and it is a good library — but it is not
 * installed here, this machine has no route to Packagist, and the `zip`
 * extension that ZipArchive needs is switched off in php.ini. Three things to
 * arrange before an office can save a list of residents is three things that
 * can be missing again on whatever machine this ends up on.
 *
 * So the ZIP is written by hand, with entries STORED rather than deflated.
 * The file is larger than a compressed one and every spreadsheet program
 * opens it just the same.
 *
 * Rows are written through a callback rather than collected into an array:
 * the register is sized for twenty thousand residents, and holding all of
 * them as PHP arrays to build one file is how an export becomes a memory
 * limit. The sheet is built into a temp stream that spills to disk past 8MB.
 */
class Xlsx
{
    /** Where the sheet body is kept while it is being written. */
    private const SPILL_AT = 8 * 1024 * 1024;

    /** What a browser has to be told this file is. */
    public const CONTENT_TYPE =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    /**
     * Write one sheet straight to the output.
     *
     * `$writeRows` is handed a function; call it once per row with an array
     * of cell values. Numbers are written as numbers, everything else as
     * text — a resident number like "2026-000101" must stay text, or Excel
     * reads it as a date.
     *
     * The response headers are the caller's: this is used inside a Laravel
     * streamed response, which sets its own.
     */
    public static function write(
        array $headers,
        callable $writeRows,
        string $sheetTitle = 'Residents'
    ): void {
        $sheet = fopen('php://temp/maxmemory:' . self::SPILL_AT, 'w+b');

        fwrite($sheet, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<sheetData>');

        $line = 0;
        $row = function (array $cells) use ($sheet, &$line): void {
            $line++;
            fwrite($sheet, self::row($line, $cells));
        };

        $row($headers);
        $writeRows($row);

        fwrite($sheet, '</sheetData></worksheet>');

        self::zip([
            '[Content_Types].xml' => self::contentTypes(),
            '_rels/.rels' => self::rootRels(),
            'xl/workbook.xml' => self::workbook($sheetTitle),
            'xl/_rels/workbook.xml.rels' => self::workbookRels(),
            'xl/worksheets/sheet1.xml' => $sheet,
        ]);

        fclose($sheet);
    }

    /* ------------------------------------------------------------------
     | The sheet
     * ---------------------------------------------------------------- */

    private static function row(int $line, array $cells): string
    {
        $xml = '<row r="' . $line . '">';

        foreach (array_values($cells) as $i => $value) {
            /*
             * An empty cell is left out entirely. The reference on each cell
             * says where it belongs, so skipping the blanks changes nothing
             * about the layout and takes a good deal off the file.
             */
            if ($value === null || $value === '') {
                continue;
            }

            $ref = self::column($i) . $line;

            if (is_int($value) || is_float($value)) {
                $xml .= '<c r="' . $ref . '"><v>' . $value . '</v></c>';

                continue;
            }

            $xml .= '<c r="' . $ref . '" t="inlineStr"><is><t xml:space="preserve">'
                . self::text((string) $value)
                . '</t></is></c>';
        }

        return $xml . '</row>';
    }

    /**
     * Text safe to put in the XML.
     *
     * Control characters are not legal in XML at all, and one of them
     * anywhere in the file makes the whole spreadsheet unopenable — so a
     * stray character in one remarks field would cost the office the entire
     * export. They are dropped; tab, newline and carriage return are kept.
     */
    private static function text(string $value): string
    {
        $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $value) ?? $value;

        return htmlspecialchars($clean, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /** 0 → A, 25 → Z, 26 → AA. */
    private static function column(int $index): string
    {
        $name = '';

        for ($n = $index + 1; $n > 0; $n = intdiv($n - 1, 26)) {
            $name = chr(65 + (($n - 1) % 26)) . $name;
        }

        return $name;
    }

    /* ------------------------------------------------------------------
     | The parts an .xlsx has to contain
     * ---------------------------------------------------------------- */

    private static function contentTypes(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '</Types>';
    }

    private static function rootRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
    }

    private static function workbook(string $title): string
    {
        /* Excel refuses a sheet name over 31 characters or containing any of
           : \ / ? * [ ] — so it is trimmed rather than left to fail. */
        $name = mb_substr(str_replace([':', '\\', '/', '?', '*', '[', ']'], ' ', $title), 0, 31);

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="' . self::text($name) . '" sheetId="1" r:id="rId1"/></sheets>'
            . '</workbook>';
    }

    private static function workbookRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '</Relationships>';
    }

    /* ------------------------------------------------------------------
     | The ZIP around them
     * ---------------------------------------------------------------- */

    /**
     * Write a ZIP straight to the output, entries stored uncompressed.
     *
     * Stored means the size and the checksum are known before the header is
     * written, which is what makes this possible without seeking backwards
     * over a response that has already gone to the browser.
     *
     * @param array<string, string|resource> $files
     */
    private static function zip(array $files): void
    {
        $offset = 0;
        $central = '';
        [$time, $date] = self::dosStamp();

        foreach ($files as $name => $content) {
            $isStream = is_resource($content);

            if ($isStream) {
                rewind($content);
                $size = fstat($content)['size'];
                rewind($content);
                $crc = self::crcOfStream($content);
            } else {
                $size = strlen($content);
                $crc = crc32($content);
            }

            $header = pack('VvvvvvVVVvv',
                0x04034b50, 20, 0, 0, $time, $date, $crc, $size, $size, strlen($name), 0
            ) . $name;

            echo $header;

            if ($isStream) {
                rewind($content);
                /* Streamed in blocks: the sheet may have spilled to disk and
                   reading it whole would undo the point of spilling. */
                while (! feof($content)) {
                    echo fread($content, 262144);
                }
            } else {
                echo $content;
            }

            $central .= pack('VvvvvvvVVVvvvvvVV',
                0x02014b50, 20, 20, 0, 0, $time, $date, $crc, $size, $size,
                strlen($name), 0, 0, 0, 0, 32, $offset
            ) . $name;

            $offset += strlen($header) + $size;
        }

        echo $central;

        echo pack('VvvvvVVv',
            0x06054b50, 0, 0, count($files), count($files),
            strlen($central), $offset, 0
        );
    }

    private static function crcOfStream($stream): int
    {
        $crc = hash_init('crc32b');

        while (! feof($stream)) {
            hash_update($crc, (string) fread($stream, 262144));
        }

        /* hash_final gives big-endian hex; the ZIP header wants the number. */
        return (int) hexdec(hash_final($crc));
    }

    /** The time and date fields a ZIP entry carries, in MS-DOS form. */
    private static function dosStamp(): array
    {
        $now = getdate();

        return [
            ($now['hours'] << 11) | ($now['minutes'] << 5) | ($now['seconds'] >> 1),
            (max(0, $now['year'] - 1980) << 9) | ($now['mon'] << 5) | $now['mday'],
        ];
    }
}
