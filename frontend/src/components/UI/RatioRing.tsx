import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import CountUp from "./CountUp";

/**
 * A part of a whole, as a ring with the number in the middle.
 *
 * Two segments and no more, which is the only shape a donut is actually good
 * at: "how much of the whole is this". Five cases out of twelve is a
 * different fact from five, and it is the one somebody reading a caseload
 * report is after.
 *
 * The figure sits in the centre rather than in a legend, so nothing depends
 * on matching a colour to a label — there is one colour and one number.
 */

const BRAND = "#723EC3";
const REST = "#F1ECFA";

export default function RatioRing({
  value,
  of,
  caption,
  suffix = "",
  showPercent = true,
}: {
  value: number;
  /** The whole. Zero means there is nothing to be a part of. */
  of: number;
  caption: string;
  /** Written after the number — "%", " days". */
  suffix?: string;
  showPercent?: boolean;
}) {
  const whole = of > 0 ? of : 0;
  const filled = whole > 0 ? Math.min(value, whole) : 0;
  const share = whole > 0 ? Math.round((filled / whole) * 100) : 0;

  const data = [
    { name: "filled", value: filled },
    /* A ring of nothing would render as an empty box; a whole ring in the
       quiet colour says "none of it" plainly. */
    { name: "rest", value: Math.max(whole - filled, whole === 0 ? 1 : 0) },
  ];

  return (
    <div className="relative flex h-44 w-full items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={54}
            outerRadius={72}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive
            animationDuration={900}
          >
            <Cell fill={BRAND} />
            <Cell fill={REST} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* The answer, in the hole the ring leaves. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-extrabold leading-none text-dark">
          <CountUp value={value} repeat />
          {suffix}
        </p>
        {showPercent && whole > 0 && (
          <p className="mt-0.5 text-xs font-semibold text-primary">{share}%</p>
        )}
        <p className="mt-1 max-w-[7rem] text-center text-[11px] leading-tight text-gray-400">
          {caption}
        </p>
      </div>
    </div>
  );
}
