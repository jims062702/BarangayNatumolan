import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";

/** How much horizontal room the dialog gets. */
export type ModalSize = "default" | "wide" | "xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Kept for existing callers; equivalent to size="wide". */
  wide?: boolean;
  /**
   * "xl" is the landscape size for intake forms — long forms should spread
   * across the screen rather than turn into a tall column the user has to
   * scroll past the edges of.
   */
  size?: ModalSize;
}

const WIDTHS: Record<ModalSize, string> = {
  default: "max-w-lg",
  wide: "max-w-3xl",
  xl: "max-w-6xl",
};

/**
 * Rendered through a portal on <body>: `position: fixed` breaks when any
 * ancestor has a CSS transform (e.g. cards with hover animations), which
 * traps the overlay inside the card and makes it flicker.
 *
 * The body scrolls inside the dialog rather than the page, so the title and
 * close button stay reachable no matter how long the form is.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  size,
}: ModalProps) {
  if (!open) return null;

  const width = WIDTHS[size ?? (wide ? "wide" : "default")];

  return createPortal(
    // Tighter gutters and margins on a phone: `p-4` + `my-8` spent 64px of a
    // 320px screen on empty space that the form fields needed.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-dark/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 my-3 flex max-h-[94vh] w-full flex-col rounded-2xl bg-white shadow-2xl sm:my-8 sm:max-h-[90vh] ${width}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray px-4 py-3.5 sm:px-6 sm:py-4">
          <h2 className="text-base font-bold text-dark sm:text-lg">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray hover:text-dark"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
