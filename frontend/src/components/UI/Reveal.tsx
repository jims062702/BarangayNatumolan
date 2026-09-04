import { useEffect, useState } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

type RevealDirection = "up" | "down" | "left" | "right" | "none";

interface RevealProps extends HTMLMotionProps<"div"> {
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  once?: boolean;
}

const OFFSETS: Record<RevealDirection, { x?: number; y?: number }> = {
  up: { y: 44 },
  down: { y: -44 },
  left: { x: 44 },
  right: { x: -44 },
  none: {},
};

/**
 * On a phone a sideways slide-in has nowhere to hide.
 *
 * A section parked at x:±44 does not change layout, but it DOES count toward
 * `scrollWidth`, and mobile browsers size the layout viewport from that. A
 * 375px screen ended up with a 404px layout viewport, so `fixed inset-x-0`
 * stretched the navbar to 404px and left its hamburger — and the chat button —
 * outside the 375px the user can actually see.
 *
 * Wide screens have slack either side of the centred content, so the sideways
 * reveal is kept there and only phones fall back to the vertical one. The
 * `html { overflow-x: clip }` rule in index.css is the backstop; this removes
 * the cause.
 */
const NARROW = "(max-width: 639px)";

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    setNarrow(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return narrow;
}

/**
 * Scroll-reveal wrapper — fades content in from a direction when it
 * enters the viewport. Used by every landing section.
 *
 * Replays every time the element re-enters the viewport (scrolling up or
 * down); pass `once` to animate only on the first entrance.
 */
export default function Reveal({
  children,
  direction = "up",
  delay = 0,
  duration = 0.6,
  once = false,
  className = "",
  ...props
}: RevealProps) {
  const narrow = useIsNarrow();
  // Sideways reveals become vertical on a phone; up/down/none are unchanged.
  const effective: RevealDirection =
    narrow && (direction === "left" || direction === "right") ? "up" : direction;

  return (
    <motion.div
      initial={{ opacity: 0, ...OFFSETS[effective] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once, amount: 0.2 }}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
