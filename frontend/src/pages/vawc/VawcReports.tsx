import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import StatusBadge from "../../components/UI/StatusBadge";

interface Stats {
  total_cases_active: number;
  total_cases_year: number;
  referrals_made: number;
  referrals_acknowledged: number;
  cases_with_children: number;
  pending_followups: number;
  overdue_followups: number;
  protection_orders_issued: number;
  documents_on_file: number;
  closure_recommended: number;
  average_response_days: number;
  cases_by_violence_type: { violence_type: string; count: number }[];
  safety_status: Record<string, number>;
  bpo_compliance: Record<string, number>;
}

/** Object map → rows, biggest first, zero counts dropped. */
const toRows = (map: Record<string, number> | undefined) =>
  Object.entries(map ?? {})
    .map(([label, count]) => ({ label, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

function Breakdown({
  rows,
  badge = false,
  empty,
}: {
  rows: { label: string; count: number }[];
  badge?: boolean;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-400">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-gray/70">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center justify-between py-2.5 text-sm">
          {badge ? (
            <StatusBadge status={row.label} />
          ) : (
            <span className="font-medium text-dark">{row.label}</span>
          )}
          <span className="font-bold text-primary">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** 2.7 — anonymized periodic reporting and VAW Desk functionality. */
export default function VawcReports() {
  const [stats, setStats] = useState<Stats | null>(null);
  const year = new Date().getFullYear();

  const load = () => {
    api.get("/vawc/reports/statistics").then((r) => setStats(r.data.data)).catch(() => undefined);
  };

  useEffect(load, []);
  useAutoRefresh(load, REFRESH.dashboard);

  const acknowledgmentRate =
    stats && stats.referrals_made > 0
      ? Math.round((stats.referrals_acknowledged / stats.referrals_made) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="VAWC Reports & Compliance"
        subtitle={`Anonymized statistics for ${year} — safe to share with the barangay council`}
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Print report
          </button>
        }
      />

      <Card title={`Case summary — ${year}`}>
        <div className="grid gap-4 text-center sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Active cases", stats?.total_cases_active ?? 0],
            ["Cases this year", stats?.total_cases_year ?? 0],
            ["Referrals provided", stats?.referrals_made ?? 0],
            ["Cases with children", stats?.cases_with_children ?? 0],
            ["Protection orders issued", stats?.protection_orders_issued ?? 0],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl bg-secondary p-5">
              <p className="text-3xl font-extrabold text-primary">{value}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Desk responsiveness" className="mt-6">
        <div className="grid gap-4 text-center sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Avg. response time", `${stats?.average_response_days ?? 0} days`],
            ["Referral acknowledgment", `${acknowledgmentRate}%`],
            ["Follow-ups scheduled", stats?.pending_followups ?? 0],
            ["Follow-ups overdue", stats?.overdue_followups ?? 0],
            ["Closure recommended", stats?.closure_recommended ?? 0],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl bg-secondary p-5">
              <p className="text-3xl font-extrabold text-primary">{value}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Response time counts the days from intake to the first protective
          action on the case — a referral or a follow-up visit, whichever came
          first. Cases with no action yet are excluded.
        </p>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Classification of cases">
          <Breakdown
            rows={(stats?.cases_by_violence_type ?? []).map((row) => ({
              label: row.violence_type,
              count: row.count,
            }))}
            empty="No cases this year."
          />
        </Card>

        <Card title="Safety status — open cases">
          <Breakdown
            rows={toRows(stats?.safety_status)}
            badge
            empty="No follow-up visits recorded."
          />
          <p className="mt-4 text-xs text-gray-400">
            Based on the most recent visit for each open case.
          </p>
        </Card>

        <Card title="Protection order compliance">
          <Breakdown rows={toRows(stats?.bpo_compliance)} empty="No follow-up visits recorded." />
          <p className="mt-4 text-xs text-gray-400">
            {stats?.documents_on_file ?? 0} confidential document(s) on file this year.
          </p>
        </Card>
      </div>

      <p className="mt-6 rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
        Per the barangay access-control policy, no personally identifiable
        survivor information ever appears in these reports or in any general
        dashboard.
      </p>
    </div>
  );
}
