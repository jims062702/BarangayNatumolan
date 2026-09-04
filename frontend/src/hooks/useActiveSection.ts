import { useEffect, useState } from "react";

/** Give up looking for the sections after this long (the landing page is lazy-loaded). */
const WAIT_MS = 5000;

/**
 * Returns the id of the section currently crossing the upper third of the
 * viewport, so the navbar can highlight the matching link.
 *
 * NOTE: pass a stable array (defined outside the component) to avoid
 * re-creating the observer on every render.
 *
 * `resetKey` — pass the current route. The navbar lives in a layout that never
 * remounts, so on a route with no sections (e.g. /news/8) this used to build an
 * observer over nothing and never rebuild it: after navigating to the landing
 * page the highlight stayed stuck on the first link no matter where the reader
 * scrolled. Changing the key rebuilds the observer, and the retry below covers
 * the gap between the route changing and the sections actually rendering.
 */
export default function useActiveSection(
  sectionIds: readonly string[],
  resetKey?: string
): string {
  const [active, setActive] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    const started = performance.now();

    const attach = () => {
      if (cancelled) return;

      const found = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);

      // Wait for the whole set; a partial mount would leave some links dead.
      if (found.length < sectionIds.length && performance.now() - started < WAIT_MS) {
        requestAnimationFrame(attach);
        return;
      }
      if (found.length === 0) return;

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setActive(entry.target.id);
          });
        },
        { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
      );

      found.forEach((el) => observer!.observe(el));
    };

    attach();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [sectionIds, resetKey]);

  return active;
}
