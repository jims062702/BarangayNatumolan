import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiHome, FiTrendingUp, FiUserPlus, FiUsers } from "react-icons/fi";
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

function DistributionList({ data }: { data: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <ul className="space-y-2.5">
      {Object.entries(data).map(([label, count]) => (
        <li key={label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-dark">{label}</span>
            <span className="text-gray-500">{count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function PopulationOfficeDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.dashboard);

  useEffect(() => {
    api.get("/population/analytics").then((r) => setAnalytics(r.data.data)).catch(() => undefined);
  }, [tick]);

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
          {analytics && <DistributionList data={analytics.population_by_age_group} />}
        </Card>
        <Card title="Population by purok">
          {analytics && (
            <DistributionList
              data={Object.fromEntries(
                analytics.population_by_zone.map((z) => [z.zone_purok ?? "Unassigned", z.count])
              )}
            />
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Sex distribution">
            {analytics && <DistributionList data={analytics.population_by_gender} />}
          </Card>
          <Card title="Demographic events (this year)">
            {(analytics?.events_this_year ?? []).length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">No events recorded.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {analytics?.events_this_year.map((event) => (
                  <li key={event.event_type} className="flex justify-between">
                    <span className="text-dark">{event.event_type}</span>
                    <span className="font-semibold text-primary">{event.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
