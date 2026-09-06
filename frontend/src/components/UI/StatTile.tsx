import type { IconType } from "react-icons";
import CountUp from "./CountUp";
import { useReveal, revealProps } from "../../hooks/useReveal";

type Tone = "primary" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: IconType;
  tone?: Tone;
  hint?: string;
  /** Milliseconds behind the tile before it. RevealGroup fills this in. */
  delay?: number;
  className?: string;
  /**
   * Count up again every time the tile scrolls back into view.
   *
   * On by default, to match the card it sits in: the card fades in again on
   * the way back, and a number that stays put beside a card that moves reads
   * as a number that has frozen. Turn it off for a tile in a place somebody
   * scrolls past constantly.
   */
  recount?: boolean;
}

export default function StatTile({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
  delay = 0,
  className = "",
  recount = true,
}: StatTileProps) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const reveal = revealProps(shown, delay);

  return (
    <div
      ref={ref}
      style={reveal.style}
      className={`flex items-center gap-4 rounded-2xl border border-gray bg-white p-5 shadow-sm ${reveal.className} ${className}`}
    >
      {Icon && (
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-dark">
          {/*
            A number counts up; a string is just shown. "0.56" is a number to
            a person and a string to this component, so anything that arrives
            as text is left alone rather than parsed and guessed at.
          */}
          {typeof value === "number" ? <CountUp value={value} repeat={recount} /> : value}
        </p>
        {hint && <p className="truncate text-xs text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}
