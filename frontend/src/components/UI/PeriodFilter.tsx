/**
 * "Which cases, from when" — one control, shared by every docket.
 *
 * The five presets are a ladder: today sits inside this week, inside this
 * month, inside the half, inside the year. Picking a named month or year
 * steps off that ladder entirely, so the two are mutually exclusive here —
 * the server resolves a named month ahead of a preset, and a screen that
 * showed both as chosen would be showing one thing and doing another.
 */

export interface Period {
  /** One of the presets, or "" for all time. */
  period: string;
  /** "1".."12", or "" — a month always resolves within `year`. */
  month: string;
  /** "2025", "2026", or "". */
  year: string;
}

export const ALL_TIME: Period = { period: "", month: "", year: "" };

const PRESETS: { key: string; label: string }[] = [
  { key: "", label: "All time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "half_year", label: "Half-year" },
  { key: "year", label: "This year" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * What to send with the request.
 *
 * Same order of precedence the server applies, so the page never asks for one
 * window and displays the name of another.
 */
export function periodParams(p: Period): Record<string, string> {
  if (p.month) return p.year ? { month: p.month, year: p.year } : { month: p.month };
  if (p.year) return { year: p.year };
  if (p.period) return { period: p.period };

  return {};
}

/** Whether anything is actually narrowing the list. */
export function isFiltered(p: Period): boolean {
  return Boolean(p.period || p.month || p.year);
}

const chip = (active: boolean) =>
  `cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition ${
    active
      ? "border-primary bg-primary text-white"
      : "border-gray bg-white text-dark hover:border-primary/50"
  }`;

const select =
  "cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";

export default function PeriodFilter({
  value,
  onChange,
  years,
  /** What the server says it actually applied — "September 2026", "This week". */
  showing,
  count,
  noun = "case",
}: {
  value: Period;
  onChange: (next: Period) => void;
  /** Years that have records in them, newest first. */
  years: number[];
  showing?: string | null;
  count?: number;
  noun?: string;
}) {
  /* A preset and a named month are different questions, so choosing one
     clears the other rather than quietly losing to it on the server. */
  const pickPreset = (key: string) => onChange({ period: key, month: "", year: "" });

  return (
    <div className="mb-4 rounded-2xl border border-gray bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => pickPreset(preset.key)}
            aria-pressed={!value.month && !value.year && value.period === preset.key}
            className={chip(!value.month && !value.year && value.period === preset.key)}
          >
            {preset.label}
          </button>
        ))}

        <span className="mx-1 hidden h-6 w-px bg-gray sm:block" aria-hidden="true" />

        <select
          aria-label="Month"
          value={value.month}
          onChange={(e) => onChange({ period: "", month: e.target.value, year: value.year })}
          className={select}
        >
          <option value="">Month: Any</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={String(i + 1)}>{name}</option>
          ))}
        </select>

        <select
          aria-label="Year"
          value={value.year}
          onChange={(e) => onChange({ period: "", month: value.month, year: e.target.value })}
          className={select}
        >
          <option value="">Year: Any</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>

      {/*
        The window the SERVER resolved, not the one the buttons imply. A month
        picked with no year means this year, and saying so out loud is cheaper
        than letting somebody work it out from the rows.
      */}
      {(showing || count !== undefined) && (
        <p className="mt-3 text-xs text-gray-500">
          Showing{" "}
          {count !== undefined && (
            <span className="font-semibold text-dark">
              {count} {noun}{count === 1 ? "" : "s"}
            </span>
          )}
          {showing ? <> from <span className="font-semibold text-dark">{showing}</span></> : " from all time"}.
        </p>
      )}
    </div>
  );
}
