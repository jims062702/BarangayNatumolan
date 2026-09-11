import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiHome, FiTrendingUp, FiUserPlus, FiUsers } from "react-icons/fi";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Pie,
  PieChart,
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
import StatTile from "../../components/UI/StatTile";
import PageHeader from "../../components/UI/PageHeader";
import { DashboardSkeleton } from "../../components/UI/Skeleton";
import ReplayOnView from "../../components/UI/ReplayOnView";
import CountUp from "../../components/UI/CountUp";
import RevealGroup from "../../components/UI/RevealGroup";
import BandChart from "../../components/UI/BandChart";

interface MonthPoint {
  month: string;
  label: string;
  added: number;
  on_the_register: number;
}

interface Analytics {
  total_population: number;
  total_households: number;
  average_household_size: number;
  portal_accounts: number;
  population_by_age_group: Record<string, number>;
  population_by_gender: Record<string, number>;
  population_by_zone: { zone_purok: string; count: number }[];
  events_this_year: { event_type: string; count: number }[];
  register_by_month: MonthPoint[];
  dependency: {
    young_dependents: number;
    working_age: number;
    old_dependents: number;
    unknown_age: number;
    youth_dependency_ratio: number;
    old_age_dependency_ratio: number;
    total_dependency_ratio: number;
  };
  migration: {
    year: number;
    in_migration: number;
    out_migration: number;
    net_migration: number;
  };
  growth: {
    year: number;
    births: number;
    deaths: number;
    natural_increase: number;
    net_change: number;
    growth_rate: number;
    newly_registered: number;
  };
  sector_counts: { sector_type: string; count: number }[];
  intervention: {
    households_flagged: number;
    by_indicator: Record<string, number>;
    indicators: string[];
  };
}

/*
 * Magnitude is one hue — the app's own, checked rather than chosen: #723EC3
 * on a white card clears the lightness band, the chroma floor and 3:1
 * contrast. Sex is the one categorical scale here, and its pair is
 * CVD-separated.
 *
 * The grid and the axis labels sit one shade off the surface, SOLID rather
 * than dashed: a dashed grid competes with the data drawn on top of it.
 */
const PRIMARY = "#723EC3";
const GENDER_COLORS: Record<string, string> = {
  Male: "#723EC3",
  Female: "#0EA5A4",
  Other: "#E8892B",
};
const AXIS = "#9CA3AF";
const GRID = "#ECEEF3";
const tooltipStyle = { borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The month under the pointer, with both numbers named in words. */
function RegisterTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthPoint }>;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-gray bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-dark">
        {MONTH_NAMES[Number(point.month.slice(5, 7)) - 1]} {point.month.slice(0, 4)}
      </p>
      <p className="mt-1 text-sm font-bold text-dark">
        {point.on_the_register} <span className="font-medium text-gray-500">on the register</span>
      </p>
      <p className="text-[11px] text-gray-500">
        {point.added > 0 ? `${point.added} added this month` : "none added this month"}
      </p>
    </div>
  );
}

export default function PopulationOfficeDashboard() {
  /*
   * Compared by VALUE, not by reference.
   *
   * The poll re-fetches the same figures every twenty seconds and hands
   * back a brand-new object each time, so the charts redrew themselves
   * and the numbers counted up again on a page nobody had touched.
   */
  const [analytics, setAnalytics] = useSettledState<Analytics | null>(null);
  /*
   * Separate from `analytics === null`, because a refresh must not blank the
   * page it is refreshing. The skeleton is for the FIRST load only; after
   * that the numbers on screen stay put until the new ones arrive.
   */
  const [firstLoad, setFirstLoad] = useState(true);

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.dashboard);

  /* And within a second when somebody else touches one. */
  usePulse("residents", () => setTick((t) => t + 1));

  useEffect(() => {
    api
      .get("/population/analytics")
      .then((r) => setAnalytics(r.data.data))
      .catch(() => undefined)
      .finally(() => setFirstLoad(false));
  }, [tick]);

  const ageData = Object.entries(analytics?.population_by_age_group ?? {}).map(([label, count]) => ({
    label: label.replace(" years", ""),
    count,
  }));
  const purokData = (analytics?.population_by_zone ?? []).map((z) => ({
    label: z.zone_purok ?? "Unassigned",
    count: z.count,
  }));
  const genderData = Object.entries(analytics?.population_by_gender ?? {})
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);
  const events = analytics?.events_this_year ?? [];
  const register = analytics?.register_by_month ?? [];
  const addedThisYear = register.reduce((sum, point) => sum + point.added, 0);

  // Standard dependency bands: 0-14 and 65+ are carried by 15-64.
  const dependencyData = analytics
    ? [
        { label: "0-14", count: analytics.dependency.young_dependents },
        { label: "15-64", count: analytics.dependency.working_age },
        { label: "65+", count: analytics.dependency.old_dependents },
      ]
    : [];
  const sectorData = (analytics?.sector_counts ?? []).filter((s) => s.count > 0);

  return (
    <div>
      <PageHeader
        title="Population Office Dashboard"
        subtitle="Demographics, households, migration, and portal account issuance"
        actions={
          <Link
            to="/population/accounts"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiUserPlus className="h-4 w-4" aria-hidden="true" /> Portal accounts
          </Link>
        }
      />

      {firstLoad ? (
        <DashboardSkeleton />
      ) : (
        <>
          <RevealGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Total Population" value={analytics?.total_population ?? 0} icon={FiUsers} />
            <StatTile label="Households" value={analytics?.total_households ?? 0} icon={FiHome} tone="success" />
            <StatTile label="Avg. Household Size" value={analytics?.average_household_size ?? 0} icon={FiTrendingUp} tone="warning" />
            <StatTile label="Portal Accounts" value={analytics?.portal_accounts ?? 0} icon={FiUserPlus} tone="danger" />
          </RevealGroup>

          {/* ---------- Age, and who the barangay is ---------- */}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title="Age distribution" className="flex h-full flex-col">
                <p className="-mt-2 mb-3 text-xs text-gray-500">
                  Residents in each band, and the shape the bands make.
                </p>
                {ageData.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center py-20 text-sm text-gray-400">
                    No birthdates recorded yet.
                  </p>
                ) : (
                  <ReplayOnView className="flex min-h-0 flex-1 flex-col">
                    <BandChart data={ageData} minHeight={260} unit="residents" />
                  </ReplayOnView>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Sex distribution">
                {genderData.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">No data yet.</p>
                ) : (
                  <ReplayOnView>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={genderData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={76}
                        paddingAngle={2}
                        stroke="#fff"
                        strokeWidth={2}
                        isAnimationActive
                        animationDuration={900}
                        labelLine={false}
                        label={(props: {
                          cx?: number; cy?: number; midAngle?: number;
                          innerRadius?: number; outerRadius?: number; value?: number;
                        }) => {
                          const rad = Math.PI / 180;
                          const cx = props.cx ?? 0;
                          const cy = props.cy ?? 0;
                          const mid = props.midAngle ?? 0;
                          const inner = props.innerRadius ?? 0;
                          const outer = props.outerRadius ?? 0;
                          const r = inner + (outer - inner) / 2;
                          const x = cx + r * Math.cos(-mid * rad);
                          const y = cy + r * Math.sin(-mid * rad);
                          return (
                            <text x={x} y={y} fill="#fff" fontSize={12} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                              {props.value}
                            </text>
                          );
                        }}
                      >
                        {genderData.map((d) => (
                          <Cell key={d.name} fill={GENDER_COLORS[d.name] ?? "#9CA3AF"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} residents`, n]} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  </ReplayOnView>
                )}
              </Card>

              <Card title="Demographic events (this year)">
                {events.length === 0 ? (
                  <p className="py-3 text-center text-sm text-gray-400">No events recorded.</p>
                ) : (
                  <ReplayOnView>
                  <ResponsiveContainer width="100%" height={Math.max(90, events.length * 42)}>
                    <ComposedChart layout="vertical" data={events} margin={{ top: 4, right: 28, bottom: 0, left: 8 }} barCategoryGap="28%">
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis type="category" dataKey="event_type" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={104} />
                      <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v}`, "Count"]} />
                      <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={16}>
                        <LabelList dataKey="count" position="right" fontSize={11} fill="#4B5563" />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                  </ReplayOnView>
                )}
              </Card>
            </div>
          </div>

          {/* ---------- The year, and the line it draws ---------- */}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6">
              <Card
                title={`Population growth — ${analytics?.growth.year ?? new Date().getFullYear()}`}
                className="flex-1"
              >
                <dl className="divide-y divide-gray/70 text-sm">
                  {[
                    ["Births", analytics?.growth.births ?? 0],
                    ["Deaths", analytics?.growth.deaths ?? 0],
                    ["Natural increase", analytics?.growth.natural_increase ?? 0],
                    ["Newly registered", analytics?.growth.newly_registered ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between py-2.5">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-semibold text-dark">{value}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-gray-500">Growth rate</dt>
                    <dd
                      className={`font-bold ${
                        (analytics?.growth.growth_rate ?? 0) < 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {(analytics?.growth.growth_rate ?? 0) > 0 ? "+" : ""}
                      {analytics?.growth.growth_rate ?? 0}%
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-gray-400">
                  Natural increase plus net migration, against the headcount at the start of the year.
                </p>
              </Card>

              <Card
                title={`Migration — ${analytics?.migration.year ?? new Date().getFullYear()}`}
                className="flex-1"
              >
                <dl className="divide-y divide-gray/70 text-sm">
                  {[
                    ["Transferred in", analytics?.migration.in_migration ?? 0],
                    ["Transferred out", analytics?.migration.out_migration ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between py-2.5">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-semibold text-dark">{value}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-gray-500">Net migration</dt>
                    <dd
                      className={`font-bold ${
                        (analytics?.migration.net_migration ?? 0) < 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {(analytics?.migration.net_migration ?? 0) > 0 ? "+" : ""}
                      {analytics?.migration.net_migration ?? 0}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-gray-400">
                  Counted from verified Transfer In / Transfer Out events recorded this year.
                </p>
              </Card>
            </div>

            {/*
              The only genuine TREND on this page, and so the only thing a
              line belongs on. Every other figure here is a snapshot — fifty
              residents, ninety households, today — and none of them says
              whether that fifty is growing, which is the question a health
              post or a feeding programme is planned against.
            */}
            <div className="lg:col-span-2">
              <Card className="flex h-full flex-col">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-dark">How the register has grown</h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Residents on the register, counted from the month each was added
                    </p>
                  </div>

                  {register.length > 0 && (
                    <p className="text-right text-xs text-gray-500">
                      <CountUp
                        value={register[register.length - 1].on_the_register}
                        repeat
                        className="text-2xl font-bold text-dark"
                      />{" "}
                      now
                      {addedThisYear > 0 && (
                        <span className="ml-2 font-semibold text-success">
                          +{addedThisYear} this year
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <ReplayOnView className="min-h-0 w-full flex-1 [height:260px] [min-height:260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={register} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <defs>
                        {/*
                          The fill fades out downward so the area reads as
                          weight under the line rather than as a second mark.
                        */}
                        <linearGradient id="registerFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid stroke={GRID} vertical={false} />
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
                      <Tooltip cursor={{ stroke: GRID, strokeWidth: 1 }} content={<RegisterTip />} />
                      <Area
                        type="monotone"
                        dataKey="on_the_register"
                        stroke={PRIMARY}
                        strokeWidth={2}
                        fill="url(#registerFill)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff", fill: PRIMARY }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ReplayOnView>

                <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                  The line only ever climbs: it is the register as it stands today, laid out over
                  the months it was built in. People who have since left are not carried.
                </p>
              </Card>
            </div>
          </div>

          {/* ---------- Where they live, and who carries whom ---------- */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Population by purok" className="flex h-full flex-col">
              <p className="-mt-2 mb-3 text-xs text-gray-500">
                Residents in each purok, in purok order.
              </p>
              {purokData.length === 0 ? (
                <p className="flex flex-1 items-center justify-center py-16 text-sm text-gray-400">
                  No puroks assigned yet.
                </p>
              ) : (
                <ReplayOnView className="flex min-h-0 flex-1 flex-col">
                  <BandChart data={purokData} minHeight={240} unit="residents" />
                </ReplayOnView>
              )}
            </Card>

            <Card title="Dependency groups" className="flex h-full flex-col">
              {dependencyData.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No birthdates recorded yet.</p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <ReplayOnView className="flex min-h-0 flex-1 flex-col">
                    <BandChart data={dependencyData} minHeight={180} unit="residents" />
                  </ReplayOnView>
                  <dl className="mt-3 shrink-0 divide-y divide-gray/70 text-sm">
                    {[
                      ["Youth dependency", analytics?.dependency.youth_dependency_ratio],
                      ["Old-age dependency", analytics?.dependency.old_age_dependency_ratio],
                      ["Total dependency", analytics?.dependency.total_dependency_ratio],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex items-center justify-between py-2">
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="font-semibold text-dark">{value ?? 0} per 100</dd>
                      </div>
                    ))}
                  </dl>
                  {(analytics?.dependency.unknown_age ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-gray-400">
                      {analytics?.dependency.unknown_age} resident(s) have no birthdate and are
                      excluded from these ratios.
                    </p>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* ---------- Sectoral counts & intervention shortlist ---------- */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card
              title="Sectoral counts"
              className="h-full"
              action={
                <Link to="/population/sectors" className="text-xs font-semibold text-primary hover:underline">
                  Open master lists
                </Link>
              }
            >
              {sectorData.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No sectors assigned yet.</p>
              ) : (
                <ReplayOnView>
                <ResponsiveContainer width="100%" height={Math.max(120, sectorData.length * 30)}>
                  <ComposedChart layout="vertical" data={sectorData} margin={{ top: 4, right: 32, bottom: 0, left: 8 }} barCategoryGap="26%">
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="sector_type" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={132} />
                    <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} residents`, "Count"]} />
                    <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={14}>
                      <LabelList dataKey="count" position="right" fontSize={11} fill="#4B5563" />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
                </ReplayOnView>
              )}
            </Card>

            <Card title="Households needing possible intervention" className="h-full">
              <div className="mb-4 rounded-2xl bg-secondary p-5 text-center">
                <p className="text-3xl font-extrabold text-primary">
                  {analytics?.intervention.households_flagged ?? 0}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  household(s) with at least one vulnerability indicator
                </p>
              </div>
              <dl className="divide-y divide-gray/70 text-sm">
                {Object.entries(analytics?.intervention.by_indicator ?? {})
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([indicator, count]) => (
                    <div key={indicator} className="flex items-center justify-between py-2.5">
                      <dt className="text-gray-500">{indicator}</dt>
                      <dd className="font-semibold text-dark">{count}</dd>
                    </div>
                  ))}
              </dl>
              {Object.values(analytics?.intervention.by_indicator ?? {}).every((c) => c === 0) && (
                <p className="py-4 text-center text-sm text-gray-400">
                  No households carry a priority-sector indicator yet.
                </p>
              )}
              <p className="mt-4 text-xs text-gray-400">
                An indicator-based shortlist for follow-up — not an official needs assessment. A
                household is counted once per indicator, however many members carry it.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
