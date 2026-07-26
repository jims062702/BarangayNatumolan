import { useEffect, useState } from "react";
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
