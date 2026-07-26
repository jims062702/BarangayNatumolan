import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiClock, FiSend, FiShield } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import PageHeader from "../../components/UI/PageHeader";

interface VawcStats {
  total_cases_active: number;
  total_cases_year: number;
  referrals_made: number;
  cases_with_children: number;
  pending_followups: number;
  cases_by_violence_type: { violence_type: string; count: number }[];
}

export default function VawcDashboard() {
  const [stats, setStats] = useState<VawcStats | null>(null);

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.dashboard);

  useEffect(() => {
    api
      .get("/vawc/reports/statistics")
      .then((response) => setStats(response.data.data))
      .catch(() => undefined);
  }, [tick]);

  return (
    <div>
      <PageHeader
        title="VAWC Desk Dashboard"
        subtitle="Confidential caseload overview — anonymized figures only"
        actions={
          <Link
            to="/vawc/cases"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Open case registry
          </Link>
        }
      />

      <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-dark">
        <strong>Confidentiality:</strong> case records are visible to VAWC
        personnel only and every access is logged. Never share survivor
        information outside this desk. VAWC cases are <strong>never</strong>{" "}
        routed to Lupon mediation.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active Cases" value={stats?.total_cases_active ?? 0} icon={FiShield} tone="danger" />
        <StatTile label="Cases This Year" value={stats?.total_cases_year ?? 0} icon={FiClock} />
        <StatTile label="Referrals Made" value={stats?.referrals_made ?? 0} icon={FiSend} tone="success" />
        <StatTile label="Pending Follow-ups" value={stats?.pending_followups ?? 0} icon={FiAlertTriangle} tone="warning" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Cases by type of violence (this year)">
          {(stats?.cases_by_violence_type ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No cases recorded this year.</p>
          ) : (
            <ul className="space-y-2">
              {stats?.cases_by_violence_type.map((row) => (
                <li key={row.violence_type} className="flex items-center justify-between rounded-xl bg-secondary px-4 py-2.5">
                  <span className="text-sm font-medium text-dark">{row.violence_type}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-bold text-primary">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Cases involving children (this year)">
          <div className="flex h-full flex-col items-center justify-center gap-2 py-6">
            <p className="text-5xl font-extrabold text-primary">{stats?.cases_with_children ?? 0}</p>
            <p className="text-sm text-gray-500">
              cases include children or dependents — coordinate with MSWDO and
              child-protection agencies as needed.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
