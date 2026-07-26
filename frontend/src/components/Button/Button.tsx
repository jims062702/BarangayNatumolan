import { motion } from "framer-motion";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "outline" | "ghost";

interface ButtonProps {
  variant?: ButtonVariant;
  href?: string;
  type?: "button" | "submit" | "reset";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary-dark",
  outline:
    "border-2 border-white text-white hover:bg-white hover:text-primary",
  ghost: "text-primary hover:bg-primary/10",
};

const BASE_CLASSES =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

/**
 * Reusable button. Renders an <a> when `href` is provided, otherwise a <button>.
 */
export default function Button({
  variant = "primary",
  href,
  type = "button",
  className = "",
  onClick,
  disabled = false,
  children,
}: ButtonProps) {
  const classes = `${BASE_CLASSES} ${VARIANTS[variant]} ${className}`;

  if (href) {
    return (
      <motion.a
        href={href}
        onClick={onClick}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className={classes}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      className={`${classes} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </motion.button>
  );
}
