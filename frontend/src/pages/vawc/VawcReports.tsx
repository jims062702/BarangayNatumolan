import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";

interface Stats {
  total_cases_active: number;
  total_cases_year: number;
  referrals_made: number;
  cases_with_children: number;
  pending_followups: number;
  cases_by_violence_type: { violence_type: string; count: number }[];
}

/** Anonymized periodic reporting — VAW Desk functionality reports. */
export default function VawcReports() {
  const [stats, setStats] = useState<Stats | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    api.get("/vawc/reports/statistics").then((r) => setStats(r.data.data)).catch(() => undefined);
  }, []);

  return (
    <div>
      <PageHeader
        title="VAWC Reports & Compliance"
        subtitle={`Anonymized statistics for ${year} — safe to share with the barangay council`}
      />

      <Card title={`Summary — ${year}`}>
        <div className="grid gap-4 text-center sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Active cases", stats?.total_cases_active],
            ["Cases this year", stats?.total_cases_year],
            ["Referrals provided", stats?.referrals_made],
            ["Cases with children", stats?.cases_with_children],
            ["Pending follow-ups", stats?.pending_followups],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl bg-secondary p-5">
              <p className="text-3xl font-extrabold text-primary">{value ?? 0}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Classification of cases" className="mt-6">
        {(stats?.cases_by_violence_type ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">No cases this year.</p>
        ) : (
          <ul className="divide-y divide-gray/70">
            {stats?.cases_by_violence_type.map((row) => (
              <li key={row.violence_type} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-dark">{row.violence_type}</span>
                <span className="font-bold text-primary">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
          Per the barangay access-control policy, no personally identifiable
          survivor information ever appears in these reports or in any general
          dashboard.
        </p>
      </Card>
    </div>
  );
}
