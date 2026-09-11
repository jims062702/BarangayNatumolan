<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * A stretch of time a clerk picked, worked out in Philippine time.
 *
 * Every desk in this system asks the same five questions of its records —
 * today, this week, this month, this half, this year — and before this class
 * each one answered them for itself. The certificate desk already had the
 * careful version, including the one definition that is easy to get wrong
 * (see below); the VAWC and Lupon dockets had none. Three copies of a date
 * window is three chances for "today" to mean three different things.
 *
 * The boundaries are Philippine, never UTC. The server stores UTC, so a case
 * filed at eight this morning in Tagoloan is stored as midnight — and "today"
 * counted in UTC would file it under yesterday. Every window here is worked
 * out in Manila and converted back only at the moment it meets a column.
 */
final class DateWindow
{
    public const MANILA = 'Asia/Manila';

    /** The five periods, in the order a clerk reads them: shortest first. */
    public const PRESETS = ['today', 'week', 'month', 'half_year', 'year'];

    private function __construct(
        /** Manila time, inclusive. */
        public readonly CarbonImmutable $from,
        /** Manila time, inclusive. */
        public readonly CarbonImmutable $to,
        public readonly string $key,
        public readonly string $label,
    ) {
    }

    public static function now(): CarbonImmutable
    {
        return CarbonImmutable::now(self::MANILA);
    }

    public static function preset(string $name, ?CarbonImmutable $now = null): ?self
    {
        $now ??= self::now();

        /*
         * "Half-year" is the half we are IN — January to June, or July to
         * December. Not "the last six months": a report headed mid-year is
         * expected to line up with the barangay's own reporting halves, so
         * two of them cover the year exactly once and neither overlaps.
         */
        $halfStart = $now->month <= 6
            ? $now->startOfYear()
            : $now->startOfYear()->addMonths(6);

        return match ($name) {
            'today' => new self($now->startOfDay(), $now->endOfDay(), 'today', 'Today'),
            /* Monday to Sunday, which is what Carbon means by a week and what
               a barangay week means in practice. */
            'week' => new self($now->startOfWeek(), $now->endOfWeek(), 'week', 'This week'),
            'month' => new self($now->startOfMonth(), $now->endOfMonth(), 'month', 'This month'),
            'half_year' => new self(
                $halfStart,
                $halfStart->addMonths(6)->subSecond(),
                'half_year',
                $now->month <= 6 ? 'First half of ' . $now->year : 'Second half of ' . $now->year,
            ),
            'year' => new self($now->startOfYear(), $now->endOfYear(), 'year', 'This year'),
            default => null,
        };
    }

    public static function ofMonth(int $year, int $month): self
    {
        $start = CarbonImmutable::create($year, $month, 1, 0, 0, 0, self::MANILA);

        return new self(
            $start,
            $start->endOfMonth(),
            sprintf('%04d-%02d', $year, $month),
            $start->format('F Y'),
        );
    }

    public static function ofYear(int $year): self
    {
        $start = CarbonImmutable::create($year, 1, 1, 0, 0, 0, self::MANILA);

        return new self($start, $start->endOfYear(), (string) $year, (string) $year);
    }

    /**
     * What the request asked for, or null for "everything".
     *
     * A named month or year BEATS a preset: somebody who has picked March
     * 2025 out of a dropdown has said something more specific than "this
     * month", and the more specific answer is the one they meant.
     */
    public static function fromRequest(Request $request): ?self
    {
        $now = self::now();

        $year = self::intBetween($request->input('year'), 2000, $now->year + 1);
        $month = self::intBetween($request->input('month'), 1, 12);

        if ($month !== null) {
            return self::ofMonth($year ?? $now->year, $month);
        }

        if ($year !== null) {
            return self::ofYear($year);
        }

        $period = $request->input('period');

        return is_string($period) ? self::preset($period, $now) : null;
    }

    /**
     * Narrow a query to this window.
     *
     * `$dateOnly` is for a DATE column — one with no clock, like a filing
     * date. Those carry no timezone at all, so converting them to UTC would
     * shift a case filed on the 1st onto the 31st. They are compared as
     * Manila calendar days instead, which is what somebody typing a filing
     * date meant.
     */
    public function applyTo($query, string $column, bool $dateOnly = false)
    {
        return $dateOnly
            ? $query->whereBetween($column, [$this->from->toDateString(), $this->to->toDateString()])
            : $query->whereBetween($column, [
                $this->from->utc()->toDateTimeString(),
                $this->to->utc()->toDateTimeString(),
            ]);
    }

    /**
     * A clerk's wall clock, as the UTC the column expects.
     *
     * The forms post local time — "2026-09-06T16:25" is half past four in
     * Tagoloan, not in Greenwich — and the validation compares it against
     * Manila's clock. Without this the string went into a UTC column
     * unchanged, so a case typed this afternoon sorted eight hours ahead of
     * one the system dated itself.
     */
    public static function manilaToUtc(string $wallClock): CarbonImmutable
    {
        return CarbonImmutable::parse($wallClock, self::MANILA)->utc();
    }

    /**
     * How many rows fall in each window, for the picker itself.
     *
     * A row of periods with no numbers on them makes somebody click all six
     * to find out where the work is. Counted here so the answer arrives with
     * the page rather than after five more round trips.
     *
     * The query is cloned per window: counting on the passed builder would
     * leave the caller's own query narrowed to whichever period ran last.
     */
    public static function counts($query, string $column, bool $dateOnly = false): array
    {
        $counts = ['all' => (clone $query)->count()];

        foreach (self::PRESETS as $name) {
            $counts[$name] = self::preset($name)
                ->applyTo(clone $query, $column, $dateOnly)
                ->count();
        }

        return $counts;
    }

    /** What the page shows back, so the reader can see which window they got. */
    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'label' => $this->label,
            'from' => $this->from->toDateString(),
            'to' => $this->to->toDateString(),
        ];
    }

    /** The years worth offering in a dropdown: the earliest record to now. */
    public static function yearsFrom(?string $earliest): array
    {
        $now = self::now();
        $first = $earliest
            ? CarbonImmutable::parse($earliest, self::MANILA)->year
            : $now->year;

        return range($now->year, min($first, $now->year));
    }

    private static function intBetween($value, int $low, int $high): ?int
    {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return null;
        }

        $n = (int) $value;

        return $n >= $low && $n <= $high ? $n : null;
    }
}
