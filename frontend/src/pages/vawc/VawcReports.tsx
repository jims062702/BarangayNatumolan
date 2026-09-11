import { useEffect } from "react";
import { FiPrinter } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import { useSettledState } from "../../hooks/useSettledState";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import BandChart from "../../components/UI/BandChart";
import CountUp from "../../components/UI/CountUp";
import ReplayOnView from "../../components/UI/ReplayOnView";
import RatioRing from "../../components/UI/RatioRing";

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

/**
 * Safety, in the order it gets worse.
 *
 * The one breakdown on this page NOT sorted by size. Safe, At Risk and
 * Critical are a scale, and putting the biggest first would tell an officer
 * scanning it that the order means nothing.
 *
 * The colour was green/amber/red, which is what everybody reaches for and
 * which does not survive being checked: run against colour-blind vision, the
 * green and the amber come out 5.7 apart on a scale where 8 is the target —
 * to a red-green colour-blind reader, "Safe" and "At Risk" are the same bar.
 * Darkening them only trades that for amber against red, which is worse.
 *
 * So the order and the label carry the scale, and ONE colour marks the one
 * row an officer must not miss. Two colour classes 25 apart under every kind
 * of colour vision, instead of four that blur into two.
 */
const SAFETY_ORDER = ["Safe", "At Risk", "Critical", "Unknown"];

const CRITICAL = "#DC2626";

/** 2.7 — anonymized periodic reporting and VAW Desk functionality. */
export default function VawcReports() {
  /*
   * Compared by VALUE, not by reference.
   *
   * The poll re-fetches the same figures every twenty seconds and hands
   * back a brand-new object each time, so the charts redrew themselves
   * and the numbers counted up again on a page nobody had touched.
   */
  const [stats, setStats] = useSettledState<Stats | null>(null);
  const year = new Date().getFullYear();

  const load = () => {
    api.get("/vawc/reports/statistics").then((r) => setStats(r.data.data)).catch(() => undefined);
  };

  useEffect(load, []);
  useAutoRefresh(load, REFRESH.dashboard);

  /* And within a second when somebody else touches one. */
  usePulse("vawc_cases", load);

  return (
    <div>
      <PageHeader
        title="VAWC Reports & Compliance"
        subtitle={`Anonymized statistics for ${year} — safe to share with the barangay council`}
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPrinter className="h-4 w-4" aria-hidden="true" /> Print report
          </button>
        }
      />

      {/*
        Five counts, so one chart.

        They share a unit — every one of them is a number of things the desk
        handled this year — which is what makes putting them on one scale
        honest. The row of tiles said the same numbers and made none of them
        comparable.
      */}
      <Card title={`Case summary — ${year}`}>
        <ReplayOnView>
          <BandChart
            data={[
              { label: "Active cases", count: stats?.total_cases_active ?? 0 },
              { label: "Cases this year", count: stats?.total_cases_year ?? 0 },
              { label: "Referrals provided", count: stats?.referrals_made ?? 0 },
              { label: "Cases with children", count: stats?.cases_with_children ?? 0 },
              { label: "Protection orders", count: stats?.protection_orders_issued ?? 0 },
            ]}
            unit="cases"
            minHeight={260}
            angledLabels
          />
        </ReplayOnView>
      </Card>

      {/*
        Days, a percentage and three counts — three different kinds of thing,
        so three charts and not one. Bars side by side would invite a
        comparison between a number of days and a number of cases.
      */}
      <Card title="Desk responsiveness" className="mt-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* A percentage is a part of a whole, which is what a ring is for. */}
          <div>
            <p className="mb-1 text-sm font-semibold text-dark">Referrals acknowledged</p>
            <ReplayOnView>
              <RatioRing
                value={stats?.referrals_acknowledged ?? 0}
                of={stats?.referrals_made ?? 0}
                caption={`of ${stats?.referrals_made ?? 0} referrals made`}
              />
            </ReplayOnView>
          </div>

          {/* Days against no target is not a shape — it is a number. */}
          <div className="flex flex-col">
            <p className="mb-1 text-sm font-semibold text-dark">Time to first action</p>
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-secondary py-6">
              <p className="text-4xl font-extrabold leading-none text-primary">
                <CountUp value={stats?.average_response_days ?? 0} repeat />
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">days on average</p>
            </div>
          </div>

          {/* Three counts, one unit. */}
          <div>
            <p className="mb-1 text-sm font-semibold text-dark">Follow-ups</p>
            <ReplayOnView>
              <BandChart
                data={[
                  { label: "Scheduled", count: stats?.pending_followups ?? 0 },
                  {
                    label: "Overdue",
                    count: stats?.overdue_followups ?? 0,
                    /* The one an officer must not miss. */
                    tone: (stats?.overdue_followups ?? 0) > 0 ? CRITICAL : undefined,
                  },
                  { label: "Closure advised", count: stats?.closure_recommended ?? 0 },
                ]}
                unit="follow-ups"
                minHeight={220}
                angledLabels
              />
            </ReplayOnView>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Response time counts the days from intake to the first protective
          action on the case — a referral or a follow-up visit, whichever came
          first. Cases with no action yet are excluded.
        </p>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Classification of cases" className="flex h-full flex-col">
          <ReplayOnView className="flex min-h-0 flex-1 flex-col">
            <BandChart
              data={(stats?.cases_by_violence_type ?? []).map((row) => ({
                label: row.violence_type,
                count: row.count,
              }))}
              empty="No cases this year."
              unit="cases"
              angledLabels
            />
          </ReplayOnView>
        </Card>

        <Card title="Safety status — open cases" className="flex h-full flex-col">
          {/*
            In severity order, not by size. These are a scale, and sorting the
            biggest first would tell an officer scanning it that the order
            means nothing.
          */}
          <ReplayOnView className="flex min-h-0 flex-1 flex-col">
            <BandChart
              data={SAFETY_ORDER.filter((name) => (stats?.safety_status?.[name] ?? 0) > 0).map(
                (name) => ({
                  label: name,
                  count: stats?.safety_status?.[name] ?? 0,
                  /* Only Critical is coloured. The rest are the one hue the
                     rest of the app uses for a count. */
                  tone: name === "Critical" ? CRITICAL : undefined,
                })
              )}
              empty="No follow-up visits recorded."
              unit="cases"
              angledLabels
            />
          </ReplayOnView>
          <p className="mt-4 text-xs text-gray-400">
            Based on the most recent visit for each open case.
          </p>
        </Card>

        <Card title="Protection order compliance" className="flex h-full flex-col">
          <ReplayOnView className="flex min-h-0 flex-1 flex-col">
            <BandChart
              data={toRows(stats?.bpo_compliance)}
              empty="No follow-up visits recorded."
              unit="cases"
              angledLabels
            />
          </ReplayOnView>
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
