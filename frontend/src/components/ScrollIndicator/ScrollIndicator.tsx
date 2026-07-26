import { motion } from "framer-motion";
import { FiChevronDown } from "react-icons/fi";

interface ScrollIndicatorProps {
  targetId?: string;
}

/**
 * Animated "scroll down" hint pinned to the bottom of the hero.
 */
export default function ScrollIndicator({ targetId = "news" }: ScrollIndicatorProps) {
  return (
    <motion.a
      href={`#${targetId}`}
      aria-label="Scroll down to the next section"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.3, duration: 0.8 }}
      className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1 text-white/90 transition-colors hover:text-white"
    >
      <motion.span
        aria-hidden="true"
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        <FiChevronDown className="h-6 w-6" />
      </motion.span>
      <span className="text-[11px] font-medium uppercase tracking-[0.25em]">
        Scroll Down
      </span>
    </motion.a>
  );
}
