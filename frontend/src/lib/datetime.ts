/**
 * Wall-clock date/time handling for user-entered schedules (appointments,
 * hearings). These are stored as the exact local time the user typed, but the
 * API tags them with a "Z" (UTC) suffix — so `new Date(value)` would shift
 * them by the browser's timezone (e.g. +8h in the Philippines, turning
 * 7:33 AM into 3:33 PM). Parse the calendar components directly instead, so
 * the time shown always matches what was entered.
 *
 * NOTE: use this ONLY for user-picked schedule fields. Real event timestamps
 * (created_at, approved_at, …) are true UTC instants and should keep using
 * `new Date(...).toLocaleString(...)` so they convert to the viewer's zone.
 */
export function parseWallClock(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(value);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

export function formatWallClock(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  const date = parseWallClock(value);
  return date ? date.toLocaleString("en-PH", options) : "—";
}
