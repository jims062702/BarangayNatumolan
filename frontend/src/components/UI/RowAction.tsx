import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { IconType } from "react-icons";

/**
 * One action on one row of a table.
 *
 * These were written page by page, and so a register had round icon buttons,
 * the VAWC docket had pills reading "Open" and "Edit", and certificates had a
 * pill reading "View" — three vocabularies for the same three verbs. A clerk
 * moving between two offices in one shift had to learn each table twice.
 *
 * So the look lives here and the page supplies only the verb.
 *
 * The label is REQUIRED and is never decorative: it is the tooltip, and it is
 * what a screen reader announces. An icon-only button with no label is a
 * button nobody blind can press, and this is the column where every
 * destructive action lives.
 */
export type RowActionTone = "default" | "primary" | "danger";

const TONES: Record<RowActionTone, string> = {
  default: "border-gray text-gray-500 hover:border-primary hover:text-primary",
  primary: "border-primary/40 text-primary hover:bg-primary hover:text-white",
  danger: "border-gray text-gray-400 hover:border-danger hover:text-danger",
};

interface Common {
  /** What it does, in a word or two. Tooltip and screen-reader label. */
  label: string;
  icon: IconType;
  tone?: RowActionTone;
  disabled?: boolean;
}

type RowActionProps = Common &
  ({ to: string; onClick?: never } | { onClick: () => void; to?: never });

export default function RowAction({
  label,
  icon: Icon,
  tone = "default",
  disabled = false,
  to,
  onClick,
}: RowActionProps) {
  const shape =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors";

  const className = `${shape} ${TONES[tone]} ${
    disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
  }`;

  const inner = <Icon className="h-4 w-4" aria-hidden="true" />;

  if (to && !disabled) {
    return (
      <Link to={to} title={label} aria-label={label} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {inner}
    </button>
  );
}

/**
 * The row of them.
 *
 * A wrapper rather than a bare flex, so the gap between actions is decided
 * once. Three tables using 1.5, 2 and 1 was most of what made the columns
 * look unrelated.
 */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-1.5">{children}</span>;
}
