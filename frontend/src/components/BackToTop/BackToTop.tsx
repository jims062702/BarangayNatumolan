import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiArrowUp } from "react-icons/fi";

/** Appears once the reader is past the hero. */
const SHOW_AFTER = 420;
/** Within this many pixels of the end counts as "the bottom". */
const BOTTOM_SLACK = 4;

const RADIUS = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Back-to-top button with a ring that fills as the page is read.
 *
 * The ring is the position indicator: empty at the top of the page, complete
 * once the footer is reached, so it doubles as "this is the end of the site".
 *
 * Stacked directly above the chat assistant in the bottom-right corner. The
 * assistant's panel opens from that same `bottom-24` line, so this sits at
 * z-40 against the panel's z-50 and is covered while the chat is open rather
 * than floating on top of it.
 */
export default function BackToTop() {
  const [progress, setProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      setScrollY(window.scrollY);
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // The page grows as lazy images load, so the denominator changes too.
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const visible = scrollY > SHOW_AFTER;
  const atBottom = (() => {
    const doc = document.documentElement;
    return doc.scrollHeight - doc.clientHeight - scrollY <= BOTTOM_SLACK;
  })();

  const goTop = () => {
    const target = document.getElementById("home");
    // Deferred a frame for the same reason as the navbar links: Framer Motion
    // restores window scroll while measuring keyframes, and a scroll started in
    // that same frame gets pinned back where it was.
    requestAnimationFrame(() => {
      const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? "instant"
        : "smooth";
      if (target) target.scrollIntoView({ behavior, block: "start" });
      else window.scrollTo({ top: 0, behavior });
      window.history.replaceState(null, "", window.location.pathname);
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={goTop}
          initial={{ opacity: 0, scale: 0.8, y: 12 }}
          /*
           * Deliberately NOT scaled up at the end state. Scaling the button
           * multiplies with the halo's own scale(1.5), and 28 x 1.08 x 1.5 =
           * 45.4px reaches past the 44px of room the `right-4` inset leaves —
           * measured at 1px of overflow on a 320/375px screen. The completed
           * ring, the halo and the deeper shadow carry the meaning without it.
           */
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          aria-label={
            atBottom
              ? "End of the page reached — back to the top"
              : `Back to the top (${Math.round(progress * 100)}% read)`
          }
          title={atBottom ? "You've reached the bottom — back to top" : "Back to top"}
          /*
           * Stays WHITE at the end state. The bottom of the page IS the footer,
           * which is primary-coloured — a primary fill there disappears into it
           * and the "you've reached the end" cue is lost. The completed ring,
           * the halo and the swell carry that meaning instead, and they read on
           * both the light sections and the purple footer.
           */
          className={`fixed bottom-24 right-4 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-white text-primary shadow-xl transition-shadow duration-300 sm:right-6 ${
            atBottom ? "shadow-primary/50" : "shadow-primary/20 hover:shadow-primary/40"
          }`}
        >
          {/* Filling ring. -rotate-90 starts it at 12 o'clock. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 56 56"
            className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
          >
            <circle
              cx="28"
              cy="28"
              r={RADIUS}
              fill="none"
              strokeWidth="3"
              className="stroke-primary/15"
            />
            <circle
              cx="28"
              cy="28"
              r={RADIUS}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              className="stroke-primary transition-[stroke-dashoffset] duration-150 ease-out"
            />
          </svg>

          {/*
            Pulse marking the end of the page. scale(1.5) — never `animate-ping`
            (scale 2), which reaches 28px past a 56px button and would push the
            document wider than the screen. See `ping-contained` in index.css.
          */}
          {atBottom && (
            <span
              aria-hidden="true"
              className="animate-ping-contained absolute inset-0 -z-10 rounded-full bg-primary/40"
            />
          )}

          <FiArrowUp className="relative h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
