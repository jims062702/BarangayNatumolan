import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { Resident } from "../../types";

const SECTORS = [
  "Senior Citizen",
  "PWD",
  "Solo Parent",
  "Youth",
  "Children Under Five",
  "Pregnant Women",
  "4Ps Household",
  "Unemployed",
  "Informal Worker",
];

// Canonical slice order = a CVD-validated categorical palette (dataviz skill's
// validate_palette.js, light/white surface: all gates pass, CVD/contrast WARNs
// covered by the direct count labels + legend below). Colours are keyed to the
// sector NAME (never its rank), so a sector keeps its colour as counts change,
// and slices render in this order so adjacent slices stay distinguishable.
const SECTOR_COLORS: Record<string, string> = {
  Adult: "#723EC3", // brand purple
  Youth: "#E8892B",
  Child: "#0EA5A4",
  "Senior Citizen": "#e34948",
  "Children Under Five": "#2a78d6",
  "Solo Parent": "#ca8a04",
  PWD: "#db2777",
  "Pregnant Women": "#16a34a",
  "4Ps Household": "#0891b2",
};
const CANONICAL = Object.keys(SECTOR_COLORS);
const FALLBACK_COLOR = "#94a3b8"; // slate — any sector outside the palette
const AXIS = "#9CA3AF";
const GRID = "#E5E7EB";
const tooltipStyle = { borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 };

interface SectorReportRow {
  sector_type: string;
  count: number;
}

export default function SectorLists() {
  const [report, setReport] = useState<SectorReportRow[]>([]);
  const [selected, setSelected] = useState(SECTORS[0]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);

  // Live updates: bump `tick` to re-run the fetches below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.staff);

  useEffect(() => {
    api.get("/population/reports/sectoral").then((r) => setReport(r.data.data ?? [])).catch(() => undefined);
  }, [tick]);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/population/sectors/${encodeURIComponent(selected)}`)
      .then((r) => setResidents(r.data.data.residents.data ?? []))
      .finally(() => setLoading(false));
  }, [selected, tick]);

  // Build donut slices in the validated palette order, appending any sectors
  // not in the palette at the end. Rank never changes a sector's colour.
  const byName = Object.fromEntries(report.map((r) => [r.sector_type, r.count]));
  const chartData = [
    ...CANONICAL.filter((n) => byName[n] != null).map((n) => ({ name: n, value: byName[n] })),
    ...report.filter((r) => !CANONICAL.includes(r.sector_type)).map((r) => ({ name: r.sector_type, value: r.count })),
  ].filter((d) => d.value > 0);
  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <PageHeader
        title="Sectoral Profiling & Master Lists"
        subtitle="Validated lists for priority sectors — children, seniors, PWD, solo parents, and more"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {report.map((row) => (
          <div key={row.sector_type} className="rounded-2xl border border-gray bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-extrabold text-primary">{row.count}</p>
            <p className="mt-0.5 text-xs font-medium text-gray-500">{row.sector_type}</p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <Card title="Sector distribution">
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No sector data yet.</p>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={112}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={SECTOR_COLORS[d.name] ?? FALLBACK_COLOR} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, n) => [`${Number(v)} residents (${Math.round((Number(v) / total) * 100)}%)`, n]}
                  />
                  <Legend
                    iconType="circle"
                    layout="horizontal"
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value, entry) => {
                      const count = (entry?.payload as { value?: number } | undefined)?.value ?? 0;
                      return (
                        <span style={{ color: "#374151" }}>
                          {value} <span style={{ color: AXIS }}>· {count}</span>
                        </span>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre total (donut hole) */}
              <div className="pointer-events-none absolute inset-x-0 top-[132px] flex flex-col items-center">
                <span className="text-3xl font-extrabold text-dark">{total}</span>
                <span className="text-xs font-medium text-gray-400">sector tags</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Browse a sector list"
        action={
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className={`${inputClasses} w-56`}>
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : residents.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No residents tagged for this sector yet.</p>
        ) : (
          <ul className="divide-y divide-gray/70">
            {residents.map((resident) => (
              <li key={resident.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="font-medium text-dark">
                  {resident.first_name} {resident.last_name}
                </span>
                <span className="text-xs text-gray-400">{resident.zone_purok}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
