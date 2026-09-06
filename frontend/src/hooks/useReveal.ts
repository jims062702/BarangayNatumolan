import { useEffect, useRef, useState } from "react";

/**
 * The landing page's scroll-reveal, without the landing page's payload.
 *
 * The public site does this with framer-motion, which is fine there: it is one
 * page and the library is already paying for itself on the carousels. Pulling
 * the same 127kB into every dashboard to fade a card in would make the app
 * slower in order to make it feel faster, which is the wrong trade for a
 * clerk opening twenty pages a day.
 *
 * So it is an IntersectionObserver and two CSS classes — the same technique
 * CountUp already uses to start its numbers — and the result on screen is the
 * same fade-and-rise.
 *
 * Reduced motion is handled in the stylesheet rather than here, so a card is
 * never left invisible if the observer has not fired yet.
 */
export function useReveal<T extends HTMLElement>(options: {
  /** Animate once, or every time it comes back into view. */
  once?: boolean;
  /** How much of it has to be showing before it starts. */
  amount?: number;
} = {}) {
  const { once = false, amount = 0.12 } = options;

  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  /*
   * How many times it has arrived.
   *
   * A CSS transition replays on its own when the class comes back, but an
   * animation that lives inside a component — a chart drawing itself, a
   * number counting up — only runs when that component mounts. Hanging this
   * number on a `key` remounts it, so the second visit looks like the first.
   */
  const [plays, setPlays] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /*
     * No observer, no animation — the element is simply shown. A browser
     * without IntersectionObserver must not end up with a page of invisible
     * cards.
     */
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      setPlays(1);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          /* Counted on ARRIVAL, not on departure: a chart should redraw when
             it comes back, not while it is scrolling away. */
          setPlays((n) => n + 1);
          if (once) observer.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      { threshold: amount }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [once, amount]);

  return { ref, shown, plays };
}

/**
 * The two classes a revealed element wears, and its place in the queue.
 *
 * The delay is what turns four tiles appearing at once into four tiles
 * arriving — small enough that nobody waits for the last one.
 */
export function revealProps(shown: boolean, delay = 0) {
  return {
    className: shown ? "reveal reveal-in" : "reveal",
    style: delay ? { transitionDelay: `${delay}ms` } : undefined,
  };
}
