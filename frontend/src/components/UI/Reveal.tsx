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
  return (
    <motion.div
      initial={{ opacity: 0, ...OFFSETS[direction] }}
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
