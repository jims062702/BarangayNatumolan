import type { ReactNode } from "react";
import { useReveal, revealProps } from "../../hooks/useReveal";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Milliseconds behind the card before it.
   *
   * A row of cards that all arrive at the same instant reads as a page
   * snapping into place; a few tens of milliseconds between them reads as
   * the page arriving. RevealGroup fills this in automatically.
   */
  delay?: number;
  /** For a card that should not move — inside a modal, say. */
  still?: boolean;
}

/**
 * The reveal lives HERE rather than at every call site.
 *
 * Every dashboard in the app is built from these, so putting the animation on
 * the component gives all of them the same movement at once — and there is no
 * page left behind because somebody forgot to wrap it. It also adds no DOM
 * node, which matters: the cards sit in grids where an extra wrapper would
 * break the h-full chain that keeps a row level.
 */
export default function Card({
  title,
  action,
  children,
  className = "",
  delay = 0,
  still = false,
}: CardProps) {
  const { ref, shown } = useReveal<HTMLElement>();
  const reveal = still ? { className: "", style: undefined } : revealProps(shown, delay);

  return (
    <section
      ref={still ? undefined : ref}
      style={reveal.style}
      className={`rounded-2xl border border-gray bg-white p-5 shadow-sm ${reveal.className} ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-dark">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
