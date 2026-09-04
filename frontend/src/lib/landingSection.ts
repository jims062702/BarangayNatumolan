/**
 * Scrolling to a landing-page section from anywhere in the app.
 *
 * Two separate traps, both of which put the reader on Home instead:
 *
 * 1. Coming from another route (`/news/8` → `/#contact`), the browser resolves
 *    the fragment before React has rendered the landing sections, so the target
 *    does not exist yet and nothing scrolls. We wait for it to appear.
 *
 * 2. Already on the landing page, Framer Motion saves and restores
 *    `window.scrollTo` while it measures keyframes for any `height: auto`
 *    animation — the navbar's own mobile menu closing is one — and that restore
 *    pins the page back if the scroll started in the same frame. We defer one
 *    frame past it.
 */

/** How long to keep waiting for a section to mount (the landing page is lazy-loaded). */
const WAIT_MS = 5000;
/** How long to keep correcting for content loading in above the target. */
const SETTLE_MS = 2500;

/**
 * Holds the target in place while the page is still growing.
 *
 * The landing page carries 27 lazy-loaded images. Scrolling to a section low
 * down lands correctly and then drifts, because those images finish loading
 * *above* the target and push it down — measured at 466px short for Services,
 * Offices, Officials and Contact. Each height change is answered with an
 * instant re-scroll until the page stops changing.
 *
 * Any deliberate scroll by the reader ends the correction immediately: once
 * they take over, moving the page under them would be worse than being off.
 */
function holdPosition(target: Element): void {
  const started = performance.now();
  let lastHeight = document.documentElement.scrollHeight;
  let cancelled = false;

  const release = () => {
    cancelled = true;
    for (const type of ["wheel", "touchstart", "keydown"]) {
      window.removeEventListener(type, release);
    }
  };
  for (const type of ["wheel", "touchstart", "keydown"]) {
    window.addEventListener(type, release, { once: true, passive: true });
  }

  const tick = () => {
    if (cancelled) return;

    const height = document.documentElement.scrollHeight;
    if (height !== lastHeight) {
      lastHeight = height;
      // scrollIntoView recomputes the scroll-margin itself, so this stays
      // correct without duplicating that offset here.
      target.scrollIntoView({ behavior: "instant", block: "start" });
    }

    if (performance.now() - started < SETTLE_MS) requestAnimationFrame(tick);
    else release();
  };

  requestAnimationFrame(tick);
}

/** Scrolls to `#id` once it exists, then reflects it in the URL. */
export function scrollToLandingSection(id: string): void {
  const started = performance.now();

  const attempt = () => {
    const target = document.getElementById(id);

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // replaceState, not location.hash — setting the hash would start a second,
      // competing fragment scroll.
      window.history.replaceState(null, "", `#${id}`);
      holdPosition(target);
      return;
    }

    if (performance.now() - started < WAIT_MS) requestAnimationFrame(attempt);
  };

  requestAnimationFrame(attempt);
}
