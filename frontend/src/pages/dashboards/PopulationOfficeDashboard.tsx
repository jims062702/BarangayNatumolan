import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiHome, FiTrendingUp, FiUserPlus, FiUsers } from "react-icons/fi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import PageHeader from "../../components/UI/PageHeader";

interface Analytics {
  total_population: number;
  total_households: number;
  average_household_size: number;
  portal_accounts: number;
  population_by_age_group: Record<string, number>;
  population_by_gender: Record<string, number>;
  population_by_zone: { zone_purok: string; count: number }[];
  events_this_year: { event_type: string; count: number }[];
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

// Magnitude = one brand hue. Sex = categorical (CVD-validated: purple/teal/amber).
const PRIMARY = "#723EC3";
const GENDER_COLORS: Record<string, string> = {
  Male: "#723EC3",
  Female: "#0EA5A4",
  Other: "#E8892B",
};
const AXIS = "#9CA3AF"; // recessive gray-400
const GRID = "#E5E7EB"; // recessive gray-200
const tooltipStyle = { borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 };

export default function PopulationOfficeDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.dashboard);

  useEffect(() => {
    api.get("/population/analytics").then((r) => setAnalytics(r.data.data)).catch(() => undefined);
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
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Portal accounts
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total Population" value={analytics?.total_population ?? 0} icon={FiUsers} />
        <StatTile label="Households" value={analytics?.total_households ?? 0} icon={FiHome} tone="success" />
        <StatTile label="Avg. Household Size" value={analytics?.average_household_size ?? 0} icon={FiTrendingUp} tone="warning" />
        <StatTile label="Portal Accounts" value={analytics?.portal_accounts ?? 0} icon={FiUserPlus} tone="danger" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Age distribution">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ageData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
              <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} residents`, "Count"]} />
              <Bar dataKey="count" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={900} animationEasing="ease-out">
                <LabelList dataKey="count" position="top" fontSize={11} fill="#4B5563" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Population by purok">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={purokData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
              <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} residents`, "Count"]} />
              <Bar dataKey="count" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={900} animationEasing="ease-out">
                <LabelList dataKey="count" position="top" fontSize={11} fill="#4B5563" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="space-y-6">
          <Card title="Sex distribution">
            {genderData.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={genderData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                    isAnimationActive={false}
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
            )}
          </Card>

          <Card title="Demographic events (this year)">
            {events.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">No events recorded.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(90, events.length * 42)}>
                <BarChart layout="vertical" data={events} margin={{ top: 4, right: 28, bottom: 0, left: 8 }} barCategoryGap="28%">
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="event_type" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={104} />
                  <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v}`, "Count"]} />
                  <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive animationDuration={900} animationEasing="ease-out">
                    <LabelList dataKey="count" position="right" fontSize={11} fill="#4B5563" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </div>

      {/* Dependency groups, migration & growth */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Dependency groups">
          {dependencyData.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No birthdates recorded yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dependencyData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                  <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} residents`, "Count"]} />
                  <Bar dataKey="count" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive animationDuration={900} animationEasing="ease-out">
                    <LabelList dataKey="count" position="top" fontSize={11} fill="#4B5563" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <dl className="mt-3 divide-y divide-gray/70 text-sm">
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
            </>
          )}
        </Card>

        <Card title={`Migration — ${analytics?.migration.year ?? new Date().getFullYear()}`}>
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

        <Card title={`Population growth — ${analytics?.growth.year ?? new Date().getFullYear()}`}>
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
            Natural increase plus net migration, against the headcount at the
            start of the year.
          </p>
        </Card>
      </div>

      {/* Sectoral counts & intervention shortlist */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Sectoral counts"
          action={
            <Link to="/population/sectors" className="text-xs font-semibold text-primary hover:underline">
              Open master lists
            </Link>
          }
        >
          {sectorData.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No sectors assigned yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, sectorData.length * 30)}>
              <BarChart layout="vertical" data={sectorData} margin={{ top: 4, right: 32, bottom: 0, left: 8 }} barCategoryGap="26%">
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="sector_type" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={132} />
                <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} residents`, "Count"]} />
                <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive animationDuration={900} animationEasing="ease-out">
                  <LabelList dataKey="count" position="right" fontSize={11} fill="#4B5563" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Households needing possible intervention">
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
            An indicator-based shortlist for follow-up — not an official needs
            assessment. A household is counted once per indicator, however many
            members carry it.
          </p>
        </Card>
      </div>
    </div>
  );
}
