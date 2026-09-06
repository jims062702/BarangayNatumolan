import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiPrinter } from "react-icons/fi";
import { api } from "../../lib/api";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import DataTable from "../../components/UI/DataTable";
import { RowsSkeleton } from "../../components/UI/Skeleton";
import BandChart from "../../components/UI/BandChart";
import ReplayOnView from "../../components/UI/ReplayOnView";
import PeriodFilter, {
  ALL_TIME,
  periodParams,
  type Period,
} from "../../components/UI/PeriodFilter";

interface Report {
  as_of: string;
  counts: Record<string, number>;
  period: string | null;
  period_from: string;
  period_to: string;
  window: { key: string; label: string; from: string; to: string };
  years: number[];
  by_type: { certificate_type: string; total: number }[];
  by_status: Record<string, number>;
  by_resident: {
    resident_id: number;
    name: string;
    resident_number: string | null;
    total: number;
  }[];
}

/**
 * The windows a clerk is asked about, in the order they are asked.
 *
 * All five are shown at once rather than behind a picker, because the
 * question is never just "how many today" — it is "how many today, and is
 * that a lot?" A picker would make that comparison the clerk's own job.
 */
const WINDOWS: { key: string; label: string; note: string }[] = [
  { key: "today", label: "Today", note: "since midnight" },
  { key: "week", label: "This week", note: "Monday to Sunday" },
  { key: "month", label: "This month", note: "calendar month" },
  { key: "half_year", label: "This half-year", note: "Jan–Jun or Jul–Dec" },
  { key: "year", label: "This year", note: "calendar year" },
];

export default function CertificateReport() {
  const [report, setReport] = useState<Report | null>(null);
  /* Starts on this month, which is what the page has always opened on. */
  const [period, setPeriod] = useState<Period>({ ...ALL_TIME, period: "month" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/certificates/report", { params: periodParams(period) })
      .then((r) => setReport(r.data.data))
      .finally(() => setLoading(false));
  }, [period]);

  /* Named by the server, so a month picked with no year says which year. */
  const chosenLabel = report?.window?.label ?? "";

  /*
   * The five windows as one chart.
   *
   * They are a ladder — today sits inside this week, inside this month — so
   * the line across their tops is the shape of how far back you have to look
   * before the number stops growing. Five separate tiles said the same
   * numbers and left that comparison to the clerk.
   */
  const ladder = WINDOWS.map((w) => ({
    label: w.label.replace("This ", ""),
    count: report?.counts[w.key] ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Certificate Report"
        subtitle="How many certificates were asked for, and by whom"
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
        Counted from when the certificate was ASKED for, not when it was
        released. A clerk reporting volume is reporting demand — a request
        made today and collected next week belongs to today.
      */}
      <Card className="mb-6">
        <p className="mb-4 text-xs leading-relaxed text-gray-500">
          Counted from the day each certificate was <strong>requested</strong>, not the day
          it was released — so a request made today and collected next week is counted
          today. Dates are Philippine time.
        </p>

        <h3 className="mb-1 text-sm font-semibold text-dark">How far back you have to look</h3>
        <p className="mb-2 text-[11px] text-gray-400">
          Always counted up to today, whichever period is chosen below.
        </p>

        {loading && !report ? (
          <RowsSkeleton rows={4} what="the counts" />
        ) : (
          <ReplayOnView>
            <BandChart data={ladder} unit="certificates" minHeight={220} angledLabels />
          </ReplayOnView>
        )}

        {/*
          A week runs Monday to Sunday, so at the start of a month it reaches
          back into the last one and can read higher than "this month". That
          is a week being a week, not a miscount — said here rather than left
          for somebody to discover and distrust.
        */}
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
          A week that straddles two months can total more than the month it ends in.
        </p>
      </Card>

      {/*
        One picker, the same one the VAWC and Lupon dockets use — and the only
        one that can reach a month or a year that is not this one.
      */}
      <PeriodFilter
        value={period}
        onChange={setPeriod}
        years={report?.years ?? []}
        showing={chosenLabel}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`What was asked for · ${chosenLabel}`} className="flex h-full flex-col">
          {report?.by_type.length ? (
            <ReplayOnView className="flex min-h-0 flex-1 flex-col">
              <BandChart
                data={report.by_type.map((row) => ({
                  label: row.certificate_type,
                  count: row.total,
                }))}
                unit="certificates"
                minHeight={260}
                angledLabels
              />
            </ReplayOnView>
          ) : (
            /* Loading and empty are different answers and had the same words. */
            loading ? (
              <RowsSkeleton rows={4} what="the breakdown" />
            ) : (
              <p className="text-sm text-gray-400">Nothing was requested in this period.</p>
            )
          )}
        </Card>

        <Card title={`Where each one stands · ${chosenLabel}`} className="flex h-full flex-col">
          {Object.keys(report?.by_status ?? {}).length ? (
            <ReplayOnView className="flex min-h-0 flex-1 flex-col">
              <BandChart
                data={Object.entries(report!.by_status).map(([status, total]) => ({
                  label: status,
                  count: total,
                }))}
                unit="certificates"
                minHeight={260}
                angledLabels
              />
            </ReplayOnView>
          ) : (
            loading ? (
              <RowsSkeleton rows={3} what="the breakdown" />
            ) : (
              <p className="text-sm text-gray-400">Nothing to show.</p>
            )
          )}
        </Card>
      </div>

      {/*
        Who asked, and how often.

        Read two ways: it answers "how many has this resident asked for", and
        a name near the top is worth a second look — the same clearance
        requested four times in a month is usually one that was never
        collected.
      */}
      <Card title={`Who requested · ${chosenLabel}`} className="mt-6">
        <DataTable
          columns={[
            {
              header: "Resident",
              render: (r: Report["by_resident"][number]) => (
                <Link
                  to={`/residents/${r.resident_id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.name}
                </Link>
              ),
            },
            {
              header: "Resident no.",
              render: (r: Report["by_resident"][number]) => r.resident_number ?? "—",
            },
            {
              header: "Requested",
              render: (r: Report["by_resident"][number]) => (
                <span className="font-bold text-dark">{r.total}</span>
              ),
            },
          ]}
          rows={report?.by_resident ?? []}
          rowKey={(r) => r.resident_id}
          numbered
          total={(report?.by_resident ?? []).length}
          loading={loading}
          emptyMessage="Nobody requested a certificate in this period."
        />

        <p className="mt-3 text-[11px] text-gray-400">
          The twenty who asked most in this period.
        </p>
      </Card>
    </div>
  );
}
