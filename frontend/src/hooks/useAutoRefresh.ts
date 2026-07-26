import { useEffect, useRef } from "react";

interface AutoRefreshOptions {
  /**
   * Keep polling even when the tab is in the background. Used by the
   * notification bell so its sound/desktop alert still fire while the user
   * is on another tab. Most pages leave this off to spare the server.
   */
  evenWhenHidden?: boolean;
}

/**
 * Keeps a page's data fresh without manual refreshes.
 *
 * Re-runs `refresh` every `intervalMs`, and immediately when the user returns
 * to the tab/window. By default it pauses while the tab is hidden so
 * background tabs don't load the server; pass `evenWhenHidden` to keep going.
 *
 * Pass a "silent" loader (one that doesn't flash the loading spinner) so
 * the table simply updates in place.
 */
export function useAutoRefresh(
  refresh: () => void,
  intervalMs = 12000,
  options: AutoRefreshOptions = {}
) {
  const { evenWhenHidden = false } = options;
  const callback = useRef(refresh);
  callback.current = refresh; // always call the latest closure (page, filters…)

  useEffect(() => {
    const tick = () => {
      if (evenWhenHidden || !document.hidden) callback.current();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs, evenWhenHidden]);
}

/** Suggested refresh intervals (ms). */
export const REFRESH = {
  /** Staff work queues — changes need to show up fast. */
  staff: 12000,
  /** Dashboards / stats — slightly slower is fine. */
  dashboard: 20000,
  /** Resident portal — gentle on the server at 20k residents. */
  portal: 30000,
} as const;
