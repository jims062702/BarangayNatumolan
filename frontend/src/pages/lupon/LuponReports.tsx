import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiFolder } from "react-icons/fi";
import { api } from "../../lib/api";
import { formatWallClock } from "../../lib/datetime";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import StatTile from "../../components/UI/StatTile";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { LuponCase, LuponHearing, LuponSettlement } from "../../types";

interface MonthlyReport {
  month: string | number;
  year: string | number;
  cases_filed: number;
  cases_settled: number;
  cases_dismissed: number;
  cases_referred: number;
  hearings_held: number;
  settlement_rate: number;
}

interface Deadlines {
  upcoming_hearings: LuponHearing[];
  repudiation_window: LuponSettlement[];
  pending_compliance: LuponSettlement[];
}

/** Stages that mean the case is no longer active — the searchable archive. */
const CLOSED_STAGES = ["Settled", "Dismissed", "Referred"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

/**
 * Hearing schedules are wall-clock values the secretary typed — parse them
 * as entered rather than shifting them by the browser's timezone.
 */
const asDateTime = (value?: string | null) => formatWallClock(value);

/** Days from today until `date` — negative means already overdue. */
const daysUntil = (date?: string | null) => {
  if (!date) return null;
  const diff = new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
};

function DeadlineNote({ date }: { date?: string | null }) {
  const days = daysUntil(date);
  if (days === null) return <span className="text-gray-400">—</span>;
  if (days < 0)
    return <span className="font-semibold text-danger">{Math.abs(days)} day(s) overdue</span>;
  if (days === 0) return <span className="font-semibold text-warning">Due today</span>;
  return <span className="text-gray-500">in {days} day(s)</span>;
}

export default function LuponReports() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [deadlines, setDeadlines] = useState<Deadlines | null>(null);
  const [archive, setArchive] = useState<LuponCase[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReport = () => {
    api
      .get("/lupon/reports/monthly-transmittal", { params: { month, year } })
      .then((r) => setReport(r.data.data))
      .catch(() => setReport(null));
  };

  const loadRest = () => {
    api
      .get("/lupon/deadlines")
      .then((r) => setDeadlines(r.data.data))
      .catch(() => setDeadlines(null));

    // The archive is assembled per closed stage — the cases endpoint filters
    // one stage at a time.
    Promise.all(
      CLOSED_STAGES.map((stage) =>
        api
          .get("/lupon/cases", { params: { current_stage: stage } })
          .then((r) => (r.data.data.data ?? []) as LuponCase[])
          .catch(() => [] as LuponCase[])
      )
    )
      .then((groups) => setArchive(groups.flat()))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  useEffect(() => {
    loadRest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoRefresh(() => {
    loadReport();
    loadRest();
  }, REFRESH.dashboard);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div>
      <PageHeader
        title="Lupon Reports & Archives"
        subtitle="Monthly transmittal, deadline watch, and the searchable closed-case archive"
        actions={
          <>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Report month"
              className={`${inputClasses} w-auto cursor-pointer rounded-full py-2`}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-label="Report year"
              className={`${inputClasses} w-auto cursor-pointer rounded-full py-2`}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => window.print()}
              className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Print transmittal
            </button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Cases filed" value={report?.cases_filed ?? 0} icon={FiFolder} />
        <StatTile
          label="Cases settled"
          value={report?.cases_settled ?? 0}
          icon={FiCheckCircle}
          tone="success"
        />
        <StatTile label="Hearings held" value={report?.hearings_held ?? 0} icon={FiCalendar} />
        <StatTile
          label="Settlement rate"
          value={`${report?.settlement_rate ?? 0}%`}
          icon={FiCheckCircle}
          tone="success"
          hint={`${MONTHS[Number(month) - 1]} ${year}`}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Monthly transmittal">
          <dl className="divide-y divide-gray/70 text-sm">
            {[
              ["Cases filed", report?.cases_filed ?? 0],
              ["Cases settled", report?.cases_settled ?? 0],
              ["Cases dismissed", report?.cases_dismissed ?? 0],
              ["Cases referred", report?.cases_referred ?? 0],
              ["Hearings held", report?.hearings_held ?? 0],
              ["Settlement rate", `${report?.settlement_rate ?? 0}%`],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between py-2.5">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-semibold text-dark">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-gray-400">
            Covering {MONTHS[Number(month) - 1]} {year}, for transmittal to the DILG.
          </p>
        </Card>

        <Card title="Upcoming hearings">
          {deadlines?.upcoming_hearings?.length ? (
            <ul className="divide-y divide-gray/70 text-sm">
              {deadlines.upcoming_hearings.map((hearing) => (
                <li key={hearing.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-dark">
                      {hearing.lupon_case?.case_number ?? "—"} · {hearing.hearing_type}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {hearing.lupon_case?.case_title ?? ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">
                    {asDateTime(hearing.scheduled_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">No hearings scheduled.</p>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Ten-day repudiation window">
          <p className="mb-3 text-xs text-gray-500">
            A settlement becomes final once this period lapses without a proper
            repudiation.
          </p>
          {deadlines?.repudiation_window?.length ? (
            <ul className="divide-y divide-gray/70 text-sm">
              {deadlines.repudiation_window.map((settlement) => (
                <li key={settlement.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-dark">
                      {settlement.lupon_case?.case_number ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Deadline {asDate(settlement.repudiation_deadline)}
                    </p>
                  </div>
                  <DeadlineNote date={settlement.repudiation_deadline} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              No settlements inside the repudiation period.
            </p>
          )}
        </Card>

        <Card title="Compliance watch">
          {deadlines?.pending_compliance?.length ? (
            <ul className="divide-y divide-gray/70 text-sm">
              {deadlines.pending_compliance.map((settlement) => (
                <li key={settlement.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-dark">
                      {settlement.lupon_case?.case_number ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Due {asDate(settlement.compliance_deadline)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={settlement.status} />
                    <DeadlineNote date={settlement.compliance_deadline} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              Nothing awaiting compliance.
            </p>
          )}
        </Card>
      </div>

      <Card title="Closed-case archive">
        <DataTable
          columns={[
            {
              header: "Case No.",
              render: (c: LuponCase) => (
                <Link
                  to={`/lupon/cases/${c.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {c.case_number}
                </Link>
              ),
            },
            { header: "Title", render: (c: LuponCase) => c.case_title },
            { header: "Classification", render: (c: LuponCase) => c.case_classification },
            { header: "Filed", render: (c: LuponCase) => asDate(c.date_filed) },
            { header: "Resolved", render: (c: LuponCase) => asDate(c.date_resolved) },
            { header: "Outcome", render: (c: LuponCase) => <StatusBadge status={c.current_stage} /> },
          ]}
          rows={archive}
          rowKey={(c) => c.id}
          searchable
          searchPlaceholder="Search closed cases by number, title or classification…"
          getSearchText={(c) => `${c.case_number} ${c.case_title} ${c.case_classification}`}
          filters={[
            { label: "Outcome", getValue: (c) => c.current_stage, options: CLOSED_STAGES },
            { label: "Classification", getValue: (c) => c.case_classification },
          ]}
          loading={loading}
          emptyMessage="No closed cases in the archive yet."
        />
      </Card>

      <p className="mt-6 flex items-center gap-2 text-xs text-gray-400">
        <FiAlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        VAWC matters are outside Katarungang Pambarangay jurisdiction and never
        appear in these figures.
      </p>
    </div>
  );
}
