import type { IconType } from "react-icons";
import CountUp from "./CountUp";

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
}

export default function StatTile({ label, value, icon: Icon, tone = "primary", hint }: StatTileProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray bg-white p-5 shadow-sm">
      {Icon && (
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-dark">
          {typeof value === "number" ? <CountUp value={value} /> : value}
        </p>
        {hint && <p className="truncate text-xs text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}
