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
    </div>
  );
}
