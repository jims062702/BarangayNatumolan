import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiClock, FiSend, FiShield } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import PageHeader from "../../components/UI/PageHeader";
import RevealGroup from "../../components/UI/RevealGroup";
import ReplayOnView from "../../components/UI/ReplayOnView";
import BandChart from "../../components/UI/BandChart";
import RatioRing from "../../components/UI/RatioRing";

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
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiShield className="h-4 w-4" aria-hidden="true" /> Open case registry
          </Link>
        }
      />

      <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-dark">
        <strong>Confidentiality:</strong> case records are visible to VAWC
        personnel only and every access is logged. Never share survivor
        information outside this desk. VAWC cases are <strong>never</strong>{" "}
        routed to Lupon mediation.
      </div>

      <RevealGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active Cases" value={stats?.total_cases_active ?? 0} icon={FiShield} tone="danger" />
        <StatTile label="Cases This Year" value={stats?.total_cases_year ?? 0} icon={FiClock} />
        <StatTile label="Referrals Made" value={stats?.referrals_made ?? 0} icon={FiSend} tone="success" />
        <StatTile label="Pending Follow-ups" value={stats?.pending_followups ?? 0} icon={FiAlertTriangle} tone="warning" />
      </RevealGroup>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Cases by type of violence (this year)" className="flex h-full flex-col">
          {/*
            One hue, because this is one measure. Giving each kind of violence
            its own colour would say the colours mean something, and they
            would mean only which row it is — which the label already says.
          */}
          <ReplayOnView className="flex min-h-0 flex-1 flex-col">
            <BandChart
              data={(stats?.cases_by_violence_type ?? []).map((row) => ({
                label: row.violence_type,
                count: row.count,
              }))}
              empty="No cases recorded this year."
              unit="cases"
              minHeight={260}
              angledLabels
            />
          </ReplayOnView>
        </Card>

        {/*
          One number, so not a chart. What a chart could add here is the
          PROPORTION — five of twelve is a different fact from five — so the
          rule underneath says that much and nothing more.
        */}
        <Card title="Cases involving children (this year)" className="flex h-full flex-col">
          {/*
            A part of a whole, which is the one job a ring is good at. Five
            cases out of twelve is a different fact from five, and it is the
            one somebody reading a caseload is after.
          */}
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-2">
            <ReplayOnView className="w-full">
              <RatioRing
                value={stats?.cases_with_children ?? 0}
                of={stats?.total_cases_year ?? 0}
                caption={`of ${stats?.total_cases_year ?? 0} cases this year`}
              />
            </ReplayOnView>

            <p className="text-center text-sm text-gray-500">
              cases include children or dependents — coordinate with MSWDO and
              child-protection agencies as needed.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
