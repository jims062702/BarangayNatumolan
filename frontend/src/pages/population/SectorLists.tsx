import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertCircle, FiUsers, FiTag } from "react-icons/fi";
import {
  Area,
  AreaChart,
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
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import { useSettledState } from "../../hooks/useSettledState";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import DataTable from "../../components/UI/DataTable";
import { personName } from "../../lib/names";
import { ageFromBirthdate } from "../../components/ResidentFormFields";
import type { Resident } from "../../types";
import RevealGroup from "../../components/UI/RevealGroup";
import CountUp from "../../components/UI/CountUp";
import ReplayOnView from "../../components/UI/ReplayOnView";

interface SectorRow {
  sector_type: string;
  count: number;
}

interface CoveragePoint {
  month: string;
  label: string;
  joined: number;
  on_a_list: number;
}

interface Report {
  sectors: SectorRow[];
  population: number;
  people_on_a_list: number;
  people_on_no_list: number;
  tags: number;
  coverage: CoveragePoint[];
}

/**
 * One hue, because this is one measure — and the app's own, not a colour
 * borrowed from a dashboard screenshot.
 *
 * #723EC3 on the white card surface was checked rather than chosen: it clears
 * the lightness band, the chroma floor and 3:1 contrast against the surface.
 * The grid and axis labels sit one shade off the surface so they stay behind
 * the data instead of competing with it.
 */
const BRAND = "#723EC3";
const GRID = "#ECEEF3";
const AXIS = "#9CA3AF";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Both numbers for the month under the pointer, named in words. */
function CoverageTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CoveragePoint }>;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-gray bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-dark">
        {MONTH_NAMES[Number(point.month.slice(5, 7)) - 1]} {point.month.slice(0, 4)}
      </p>
      <p className="mt-1 text-sm font-bold text-dark">
        {point.on_a_list} <span className="font-medium text-gray-500">on a list</span>
      </p>
      <p className="text-[11px] text-gray-500">
        {point.joined > 0 ? `${point.joined} added this month` : "none added this month"}
      </p>
    </div>
  );
}

/**
 * Axis labels, shortened.
 *
 * "Children Under Five" under a column 26px wide is a collision, not a label.
 * The full name is never lost: it heads the tooltip, and it is the wording on
 * the chips below.
 */
const SHORT: Record<string, string> = {
  "Senior Citizen": "Senior",
  "Solo Parent": "Solo Parent",
  "Children Under Five": "Under 5",
  "4Ps Household": "4Ps",
};

/** How each list is used, so the page says what it is FOR and not only how many. */
const PURPOSE: Record<string, string> = {
  "Senior Citizen": "RA 9994 benefits, pension validation",
  PWD: "RA 10754 ID and discounts",
  "Solo Parent": "RA 8972 ID and leave certification",
  Youth: "SK programmes and registration",
  Child: "Feeding and immunisation",
  "Children Under Five": "Nutrition, immunisation, weighing",
  "4Ps Household": "DSWD conditional cash transfer",
  Indigent: "Certificate of Indigency, medical assistance",
  Adult: "General adult population",
};

interface SectorPoint extends SectorRow {
  short: string;
  share: number;
}

/**
 * The column under the pointer, in full.
 *
 * The axis had to shorten the name to fit; this is where it comes back whole,
 * with the count, the share of the register, and — the line that turns a tally
 * into something an officer plans from — what the list is actually used for.
 */
function SectorTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SectorPoint }>;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;

  return (
    <div className="max-w-56 rounded-xl border border-gray bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-dark">{point.sector_type}</p>
      <p className="mt-1 text-sm font-bold text-dark">
        {point.count} <span className="font-medium text-gray-500">residents</span>
        {point.share > 0 && (
          <span className="ml-1.5 text-[11px] font-medium text-gray-400">
            {point.share}% of the register
          </span>
        )}
      </p>
      {PURPOSE[point.sector_type] && (
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          {PURPOSE[point.sector_type]}
        </p>
      )}
    </div>
  );
}

export default function SectorLists() {
  /*
   * Compared by VALUE, not by reference.
   *
   * The poll re-fetches the same figures every twenty seconds and hands
   * back a brand-new object each time, so the charts redrew themselves
   * and the numbers counted up again on a page nobody had touched.
   */
  const [report, setReport] = useSettledState<Report | null>(null);
  const [selected, setSelected] = useState("all");
  const [residents, setResidents] = useState<Resident[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.staff);

  /* And within a second when somebody else touches one. */
  usePulse("residents", () => setTick((t) => t + 1));

  useEffect(() => {
    api
      .get("/population/reports/sectoral")
      .then((r) => setReport(r.data.data ?? null))
      .catch(() => undefined);
  }, [tick]);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/population/sectors/${encodeURIComponent(selected)}`, { params: { page } })
      .then((r) => {
        setResidents(r.data.data.residents.data ?? []);
        setTotal(r.data.data.residents.total ?? 0);
        setLastPage(r.data.data.residents.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  }, [selected, page, tick]);

  const sectors = report?.sectors ?? [];
  const coverage = report?.coverage ?? [];
  const grew = useMemo(
    () => coverage.reduce((sum, point) => sum + point.joined, 0),
    [coverage]
  );

  /* Already largest-first from the endpoint; this only adds what the axis
   * and the tooltip need. */
  const sectorData = useMemo<SectorPoint[]>(
    () =>
      sectors.map((row) => ({
        ...row,
        short: SHORT[row.sector_type] ?? row.sector_type,
        share: report?.population
          ? Math.round((row.count / report.population) * 100)
          : 0,
      })),
    [sectors, report]
  );

  /* Recharts hands the row back untyped, so the guard is here rather than
   * in the markup. */
  const pickSector = (entry: unknown) => {
    const row = entry as { sector_type?: string } | undefined;
    if (row?.sector_type) {
      setSelected(row.sector_type);
      setPage(1);
    }
  };
  const chosen =
    selected === "all"
      ? "everyone on a list"
      : selected === "untagged"
        ? "residents on no list at all"
        : selected;

  return (
    <div>
      <PageHeader
        title="Sectoral Profiling & Master Lists"
        subtitle="Validated lists for priority sectors — children, seniors, PWD, solo parents, and more"
      />

      {/*
        Three numbers, and the reason there are three.

        The page led with 57 — the number of TAGS — which reads as a headcount
        and is not one: one person carries several, and one carried nine.
      */}
      <RevealGroup className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <FiUsers className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold text-dark">
                {report ? <CountUp value={report.people_on_a_list} repeat /> : "—"}
              </p>
              <p className="text-sm font-medium text-dark">on at least one list</p>
              <p className="mt-0.5 text-xs text-gray-500">
                out of {report ? <CountUp value={report.population} repeat /> : "—"} residents
              </p>
            </div>
          </div>
        </Card>

        {/*
          The one worth acting on. A resident on no list is usually one nobody
          has got to yet, and the office cannot see them any other way.
        */}
        <Card className={report?.people_on_no_list ? "border-warning/40" : undefined}>
          <div className="flex items-start gap-3">
            <span
              className={`rounded-xl p-2.5 ${
                report?.people_on_no_list
                  ? "bg-warning/15 text-amber-700"
                  : "bg-secondary text-gray-400"
              }`}
            >
              <FiAlertCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold text-dark">
                {report ? <CountUp value={report.people_on_no_list} repeat /> : "—"}
              </p>
              <p className="text-sm font-medium text-dark">on no list at all</p>
              {report && report.people_on_no_list > 0 ? (
                <button
                  type="button"
                  onClick={() => { setSelected("untagged"); setPage(1); }}
                  className="mt-0.5 cursor-pointer text-xs font-semibold text-primary hover:underline"
                >
                  See who they are
                </button>
              ) : (
                <p className="mt-0.5 text-xs text-gray-500">Everybody is accounted for.</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-secondary p-2.5 text-gray-500">
              <FiTag className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold text-dark">
                {report ? <CountUp value={report.tags} repeat /> : "—"}
              </p>
              <p className="text-sm font-medium text-dark">sector tags</p>
              <p className="mt-0.5 text-xs text-gray-500">
                More than the people: one person can be on several lists.
              </p>
            </div>
          </div>
        </Card>
      </RevealGroup>

      {/*
        The one thing on this page that is a TREND, and so the only thing a
        line belongs on: how much of the barangay is on a list, month by
        month.

        The chart below it plots the same thirteen sectors as columns with a
        line across their tops. That line is a rank curve — the shape of the
        drop-off from the big lists into the long tail — and not a movement
        through time, which is what this one is.

        Brand purple on the app's own surface, validated rather than picked:
        #723ec3 on white clears the lightness band, the chroma floor and 3:1
        contrast.
      */}
      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-dark">How the lists have grown</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Residents on at least one sector list, counted from the month each was first added
            </p>
          </div>

          {coverage.length > 0 && (
            <p className="text-right text-xs text-gray-500">
              <span className="text-2xl font-bold text-dark">
                <CountUp value={coverage[coverage.length - 1].on_a_list} repeat />
              </span>{" "}
              now
              {grew > 0 && (
                <span className="ml-2 font-semibold text-success">
                  +<CountUp value={grew} repeat /> this year
                </span>
              )}
            </p>
          )}
        </div>

        {/*
          Wrapped so the draw happens when somebody is there to see it.

          Recharts animates on mount, and mount is when the fetch lands —
          which on this page is while the reader is still at the top. The
          chart below the fold finished drawing to an empty room.
        */}
        <ReplayOnView className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={coverage} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                {/*
                  The fill fades out downward so the area reads as weight
                  under the line rather than as a second, solid mark.
                */}
                <linearGradient id="coverageFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              {/* Hairline, solid, one shade off the surface — never dashed. */}
              <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />

              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: GRID }}
                tick={{ fill: AXIS, fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: AXIS, fontSize: 11 }}
              />

              {/*
                The hover layer, which an HTML chart gets by default: a
                crosshair and a tooltip naming the month and both numbers.
              */}
              <Tooltip
                cursor={{ stroke: GRID, strokeWidth: 1 }}
                content={<CoverageTip />}
              />

              <Area
                type="monotone"
                dataKey="on_a_list"
                stroke={BRAND}
                strokeWidth={2}
                fill="url(#coverageFill)"
                /* Markers appear on hover at 8px — big enough to aim at. */
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff", fill: BRAND }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ReplayOnView>

        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
          The line only ever climbs: once somebody is on a list they stay counted, so this
          reads as coverage rather than as monthly churn.
        </p>
      </Card>

      {/*
        Every sector, as a real chart — the same one the panel above uses.

        Columns carry the magnitude, and the line traces their tops. Sorted
        largest first, that line is the SHAPE of the barangay's lists: a
        steep drop from the few big ones into a long tail of small ones, which
        is the thing an officer plans around and which thirteen separate bars
        never quite say out loud.

        Same hue, same grid, same hover as the coverage chart, so the two read
        as one page rather than as two.
      */}
      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-dark">Every sector, largest first</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Click a column to open that list below
            </p>
          </div>

          {report && (
            <p className="text-right text-xs text-gray-500">
              <span className="text-2xl font-bold text-dark">
                <CountUp value={report.tags} repeat />
              </span>{" "}
              tags across{" "}
              <span className="font-semibold text-dark">
                <CountUp value={report.people_on_a_list} repeat />
              </span>{" "}
              people
            </p>
          )}
        </div>

        {sectorData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No sector lists yet.</p>
        ) : (
          <ReplayOnView className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={sectorData}
                margin={{ top: 20, right: 8, bottom: 8, left: -20 }}
              >
                <defs>
                  {/*
                    The columns sit back at low opacity and the line runs at
                    full strength on top — the same relationship the area
                    chart above has between its fill and its line.
                  */}
                  <linearGradient id="sectorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0.12} />
                  </linearGradient>
                </defs>

                {/* Hairline, solid, one shade off the surface — never dashed. */}
                <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />

                <XAxis
                  dataKey="short"
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tick={{ fill: AXIS, fontSize: 10 }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fill: AXIS, fontSize: 11 }}
                />

                <Tooltip
                  cursor={{ fill: BRAND, fillOpacity: 0.06 }}
                  content={<SectorTip />}
                />

                <Bar
                  dataKey="count"
                  barSize={26}
                  radius={[4, 4, 0, 0]}
                  className="cursor-pointer"
                  onClick={(entry: unknown) => pickSector(entry)}
                >
                  {/*
                    The chosen sector goes solid. Identity never rests on the
                    colour alone — the axis label names every column, and the
                    chips below say which list is open.
                  */}
                  {sectorData.map((row) => (
                    <Cell
                      key={row.sector_type}
                      fill={selected === row.sector_type ? BRAND : "url(#sectorFill)"}
                    />
                  ))}

                  {/*
                    Thirteen small integers above thirteen columns. The guide
                    would normally label selectively, but the count IS what
                    the office reads off this page, and hiding it behind a
                    hover was the complaint that started the rebuild.
                  */}
                  <LabelList
                    dataKey="count"
                    position="top"
                    offset={8}
                    fill="#1F2937"
                    fontSize={11}
                    fontWeight={700}
                  />
                </Bar>

                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={BRAND}
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#ffffff", stroke: BRAND, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: BRAND, stroke: "#ffffff", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ReplayOnView>
        )}

        {report && (
          <p className="mt-2 border-t border-gray pt-3 text-[11px] leading-relaxed text-gray-400">
            Hover a column for what the list is used for. Percentages are of the{" "}
            {report.population} residents on the register, and add up to more than 100
            because one person can be on several lists.
          </p>
        )}
      </Card>

      {/*
        The list itself, as a table that can be searched and filtered.

        It was a name and a purok. A Population Officer building a feeding
        list needs the age, and needs to know which of these children are also
        4Ps — and going to each profile one at a time to find out is how a
        list of forty takes an afternoon.
      */}
      <Card title="Browse a sector list">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setSelected("all"); setPage(1); }}
            aria-pressed={selected === "all"}
            className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              selected === "all" ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
            }`}
          >
            Everyone on a list
          </button>

          {sectors.map((row) => (
            <button
              key={row.sector_type}
              type="button"
              onClick={() => { setSelected(row.sector_type); setPage(1); }}
              aria-pressed={selected === row.sector_type}
              className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                selected === row.sector_type
                  ? "bg-primary text-white"
                  : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {row.sector_type}
              <span className="ml-1.5 opacity-70">{row.count}</span>
            </button>
          ))}

          {report && report.people_on_no_list > 0 && (
            <button
              type="button"
              onClick={() => { setSelected("untagged"); setPage(1); }}
              aria-pressed={selected === "untagged"}
              className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                selected === "untagged"
                  ? "bg-warning text-white"
                  : "bg-warning/15 text-amber-700 hover:bg-warning/25"
              }`}
            >
              On no list
              <span className="ml-1.5 opacity-70">{report.people_on_no_list}</span>
            </button>
          )}
        </div>

        <p className="mb-3 text-xs text-gray-500">
          Showing <strong className="text-dark">{chosen}</strong>.
        </p>

        <DataTable
          columns={[
            {
              header: "Name",
              render: (r: Resident) => (
                <Link
                  to={`/residents/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {personName(r)}
                </Link>
              ),
            },
            { header: "Resident no.", render: (r: Resident) => r.resident_number ?? "—" },
            { header: "Purok", render: (r: Resident) => r.zone_purok ?? "—" },
            {
              header: "Age",
              render: (r: Resident) => {
                const age = ageFromBirthdate(String(r.birthdate ?? ""));
                return age === null ? "—" : String(age);
              },
            },
            { header: "Sex", render: (r: Resident) => r.gender ?? "—" },
            {
              /*
                Every list they are on, not only the one being browsed. This
                is the column the page existed without, and the reason an
                officer had to open forty profiles.
              */
              header: "On these lists",
              render: (r: Resident) =>
                r.sectors?.length ? (
                  <span className="flex flex-wrap gap-1">
                    {r.sectors.map((s) => (
                      <span
                        key={s.id}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          s.sector_type === selected
                            ? "bg-primary text-white"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {s.sector_type}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">None</span>
                ),
            },
          ]}
          rows={residents}
          rowKey={(r) => r.id}
          numbered
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          loading={loading}
          searchable
          searchPlaceholder="Search a name or resident number…"
          getSearchText={(r) =>
            [
              personName(r),
              r.resident_number ?? "",
              r.zone_purok ?? "",
              r.gender ?? "",
              (r.sectors ?? []).map((s) => s.sector_type).join(" "),
            ].join(" ")
          }
          filters={[
            { label: "Purok", getValue: (r) => r.zone_purok ?? "Not recorded" },
            { label: "Sex", getValue: (r) => r.gender ?? "Not recorded" },
          ]}
          emptyMessage="Nobody is on this list."
        />
      </Card>
    </div>
  );
}
