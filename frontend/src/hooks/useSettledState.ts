import { useCallback, useRef, useState } from "react";

/**
 * State that only changes when the value actually changed.
 *
 * A polled page fetches the same answer over and over. `setState` with a
 * freshly parsed object is a new object every time even when every field in
 * it is identical, so React re-renders, and anything that animates on a data
 * change animates again: a chart redraws itself, a number counts up from
 * nowhere, a ring re-fills. Every twenty seconds, for a page nobody touched.
 *
 * Compared by value rather than by reference for exactly that reason —
 * reference equality is what the poll destroys, and it is not what "changed"
 * means to a reader.
 *
 * For DATA, not for anything a person is editing: a form field belongs in
 * ordinary state, where writing the same value twice is still a keystroke.
 */
export function useSettledState<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);

  /*
   * The last value serialised. Kept as a string so the comparison does not
   * walk a nested object on every poll, and so it survives the value being
   * replaced wholesale.
   */
  const seen = useRef<string | null>(null);

  const set = useCallback((next: T) => {
    let key: string;

    try {
      key = JSON.stringify(next) ?? "undefined";
    } catch {
      /* Circular, or something that will not serialise. Fall through and set
         it: a page that stops updating is worse than one that animates. */
      setValue(next);
      seen.current = null;

      return;
    }

    if (key === seen.current) return;

    seen.current = key;
    setValue(next);
  }, []);

  return [value, set] as const;
}
