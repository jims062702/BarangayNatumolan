import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  durationMs?: number;
  className?: string;
  locale?: string;
  /**
   * Re-run the count-up from 0 every time the number re-enters the viewport
   * (instead of only the first time). Nice for a landing-page stats band.
   */
  repeat?: boolean;
}

/**
 * Animates a number from its previous value up to `value`. Starts when the
 * element scrolls into view, and re-animates smoothly whenever the value
 * changes (e.g. a live dashboard update). Respects reduced-motion.
 */
export default function CountUp({
  value,
  durationMs = 1200,
  className,
  locale = "en-PH",
  repeat = false,
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useRef(false);
  const fromRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  const valueRef = useRef(value);
  valueRef.current = value; // always animate toward the latest value

  const animateTo = (target: number) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = Math.round(from + (target - from) * eased);
      setDisplay(current);
      fromRef.current = current;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Start counting when the number scrolls into view. With `repeat`, reset
  // to 0 when it leaves so it counts again on the next visit.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!inView.current) {
              inView.current = true;
              if (repeat) {
                fromRef.current = 0;
                setDisplay(0);
              }
              animateTo(valueRef.current);
            }
          } else if (repeat) {
            inView.current = false;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            fromRef.current = 0;
            setDisplay(0);
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat]);

  // Re-animate to the new value after live updates.
  useEffect(() => {
    if (inView.current) animateTo(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString(locale)}
    </span>
  );
}
