import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * A count across named categories, as columns with a line across their tops.
 *
 * The line is not decoration. These categories are read in a fixed order —
 * age bands, puroks, the severity of a case — so the shape of the curve, where
 * the thing bulges and where it thins, is what somebody is actually looking
 * for, and a row of separate bars never says it out loud.
 *
 * This lives here rather than inside one dashboard because the population
 * office and the VAWC desk read the same kind of fact and must not read it
 * through two charts that drift apart. One chart, one file.
 */

/** The app's own hue, checked against the card it sits on rather than picked. */
const PRIMARY = "#723EC3";
const AXIS = "#9CA3AF";
const GRID = "#ECEEF3";

const tooltipStyle = { borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 };

/**
 * One gradient per colour, named after the colour itself.
 *
 * Two charts on a page that use the same hue land on the same id and share
 * one identical definition, which is harmless. A generated id per instance
 * would make a fresh copy of the same gradient for every card on the screen.
 */
const fillId = (hex: string) => `band-${hex.replace("#", "")}`;

export interface BandRow {
  label: string;
  count: number;
  /**
   * A colour for this row alone.
   *
   * For a STATUS scale — Safe, At Risk, Critical — where the colour is part
   * of the meaning. Everything else is one hue, because one hue is what a
   * single measure deserves: a second colour would carry nothing.
   */
  tone?: string;
}

export default function BandChart({
  data,
  minHeight = 240,
  unit,
  empty,
  angledLabels = false,
}: {
  data: BandRow[];
  /**
   * A floor, not a height.
   *
   * The card is as tall as the row needs it to be, and the chart takes
   * whatever that leaves — but never less than this, or a row of short
   * cards would flatten it into a line of labels.
   */
  minHeight?: number;
  unit: string;
  /** Shown instead of an empty grid. Omit to render the chart regardless. */
  empty?: string;
  /**
   * Turns the category names to read up the page at an angle.
   *
   * For long names — "Psychological", "Protection order in force" — which
   * straight under a column either collide with their neighbours or get
   * quietly truncated to something that reads as a different word.
   */
  angledLabels?: boolean;
}) {
  if (empty !== undefined && data.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">{empty}</p>;
  }

  /* Every distinct colour on the chart needs its own gradient to point at. */
  const tones = Array.from(new Set(data.map((row) => row.tone ?? PRIMARY)));

  return (
    /*
      A height, not only a floor.

      ResponsiveContainer measures its parent, and a parent whose height is
      `auto` measures zero — so the chart never draws, and what is left is an
      empty box exactly `minHeight` tall. That is what happens the moment this
      sits under any wrapper that does not carry the flex chain down, which is
      a thing every call site would otherwise have to remember.

      `flex-1` still wins inside a flex column, so a card that wants the chart
      to fill it gets that; everywhere else the definite height means the
      chart simply works.
    */
    <div className="min-h-0 w-full flex-1" style={{ height: minHeight, minHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          /*
            No extra bottom margin when the labels turn: the axis `height`
            below already reserves the band they occupy, and adding a margin
            on top of it only steals height from the plot.
          */
          margin={{ top: 22, right: 8, bottom: 0, left: -18 }}
        >
          <defs>
            {/*
              The columns sit back at low opacity and the line runs at full
              strength on top — the same relationship an area chart has between
              its fill and its line.
            */}
            {tones.map((tone) => (
              <linearGradient key={tone} id={fillId(tone)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tone} stopOpacity={0.5} />
                <stop offset="100%" stopColor={tone} stopOpacity={0.12} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="label"
            interval={0}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={{ stroke: GRID }}
            tickLine={false}
            angle={angledLabels ? -28 : 0}
            textAnchor={angledLabels ? "end" : "middle"}
            height={angledLabels ? 64 : 30}
          />
          {/*
            Wide enough for the number. At 30px a three-digit headcount was
            clipped to its first digit, so the axis read 8 where it meant 83.
          */}
          <YAxis
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgba(114,62,195,0.06)" }}
            contentStyle={tooltipStyle}
            formatter={(v) => [`${v} ${unit}`, "Count"]}
          />
          <Bar dataKey="count" barSize={38} radius={[4, 4, 0, 0]}>
            {data.map((row) => (
              <Cell key={row.label} fill={`url(#${fillId(row.tone ?? PRIMARY)})`} />
            ))}
            {/* Text in ink, never in the colour of the bar it labels. */}
            <LabelList
              dataKey="count"
              position="top"
              offset={8}
              fontSize={11}
              fontWeight={700}
              fill="#1F2937"
            />
          </Bar>
          <Line
            type="monotone"
            dataKey="count"
            stroke={PRIMARY}
            strokeWidth={2}
            dot={{ r: 3, fill: "#ffffff", stroke: PRIMARY, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: PRIMARY, stroke: "#ffffff", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
