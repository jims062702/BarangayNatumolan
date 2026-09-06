import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAward,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiFileText,
} from "react-icons/fi";
import { api } from "../../lib/api";
import { formatWallClock } from "../../lib/datetime";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import DataTable from "../../components/UI/DataTable";
import type { Appointment, Certificate, ServiceRequest } from "../../types";

interface Props {
  executive?: boolean;
}

/** Punong Barangay executive view payload (module 1.6). */
interface ExecutiveSummary {
  documents_awaiting_signature: {
    id: number;
    document_type: string;
    document_number: string;
    document_title: string;
    document_date: string;
    creator?: { name: string } | null;
  }[];
  documents_awaiting_count: number;
  /* Retired with the referrals module. Left declared so an older API
     response does not become a type error mid-deploy. */
  referrals_requiring_action?: {
    id: number;
    referral_number: string;
    receiving_office: string;
    followup_date?: string | null;
    status: string;
    resident?: { first_name: string; last_name: string } | null;
  }[];
  referrals_action_count?: number;
  office_workload: Record<string, { pending: number; in_progress: number; total: number }>;
  aging_requests: Record<string, number>;
  oldest_open_request?: {
    request_number: string;
    service_type: string;
    office: string;
    days_open: number;
  } | null;
  frequently_requested: { service_type: string; count: number }[];
  service_statistics: {
    open_requests: number;
    completed_this_month: number;
    certificates_released_this_month: number;
    residents_served_this_month: number;
  };
  recent_directives: {
    id: number;
    document_type: string;
    document_number: string;
    document_title: string;
    document_date: string;
  }[];
  announcements: { id: number; title: string; created_at: string }[];
}

const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

/** Aging buckets get progressively louder the longer work sits. */
const AGING_TONES: Record<string, string> = {
  "0-3 days": "text-gray-500",
  "4-7 days": "text-dark",
  "8-14 days": "text-warning",
  "15+ days": "text-danger",
};

/**
 * Main Office dashboard.
 * `executive` = the Punong Barangay view: appointments, KP cases, and what
 * the counter has produced (requests, the queue and the certificate workflow
 * itself are the clerk's work). Certificates are neither approved nor signed
 * off in the system, so nothing here acts on one — the PB signs paper.
 */
export default function MainOfficeDashboard({ executive = false }: Props) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<ServiceRequest[]>([]);
  const [readyQueue, setReadyQueue] = useState<Certificate[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [kpCounts, setKpCounts] = useState({ hearings: 0, repudiation: 0 });
  const [exec, setExec] = useState<ExecutiveSummary | null>(null);

  const load = async () => {
    const [summary, pending] = await Promise.all([
      api.get("/dashboard/summary"),
      api.get("/dashboard/pending-items"),
    ]);
    setStats({ ...summary.data.data.quick_stats, ...pending.data.data });

    if (executive) {
      const [certs, appts, deadlines, executive] = await Promise.all([
        // Printed and waiting on the counter for the resident to collect.
        api.get("/certificates", { params: { status: "Ready to Claim" } }),
        api.get("/appointments", { params: { status: "Scheduled" } }),
        api.get("/lupon/deadlines").catch(() => null),
        api.get("/dashboard/executive").catch(() => null),
      ]);
      setReadyQueue(certs.data.data.data ?? []);
      setAppointments(appts.data.data.data ?? []);
      if (deadlines) {
        setKpCounts({
          hearings: (deadlines.data.data.upcoming_hearings ?? []).length,
          repudiation: (deadlines.data.data.repudiation_window ?? []).length,
        });
      }
      setExec(executive?.data.data ?? null);
    } else {
      setRecent(summary.data.data.recent_activity?.recent_requests ?? []);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executive]);

  // Live updates: new applications/appointments appear without a refresh.
  useAutoRefresh(() => load().catch(() => undefined), REFRESH.dashboard);



  if (executive) {
    return (
      <div>
        <PageHeader
          title="Executive Dashboard"
          subtitle="Everything awaiting your decision, and the barangay-wide service picture"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile label="Ready To Claim" value={stats.ready_to_claim ?? 0} icon={FiClock} tone="warning" />
          <StatTile label="Documents To Sign" value={exec?.documents_awaiting_count ?? 0} icon={FiFileText} tone="warning" />
          <StatTile label="Certificates This Month" value={stats.monthly_certificates ?? 0} icon={FiAward} />
          <StatTile label="Scheduled Appointments" value={appointments.length} icon={FiCalendar} />
          <StatTile label="KP Hearings / Deadlines" value={kpCounts.hearings + kpCounts.repudiation} icon={FiBookOpen} tone="warning" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card
            title="Certificates waiting on the counter"
            action={
              <Link to="/certificates" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            }
          >
            {readyQueue.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nothing waiting — all caught up.</p>
            ) : (
              <ul className="divide-y divide-gray/70">
                {readyQueue.slice(0, 6).map((certificate) => (
                  <li key={certificate.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-dark">
                        {certificate.certificate_type} — {certificate.resident?.first_name}{" "}
                        {certificate.resident?.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {certificate.certificate_number} · {certificate.purpose}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                      Ready to claim
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Upcoming appointments"
            action={
              <Link to="/appointments" className="text-sm font-medium text-primary hover:underline">
                Open scheduler
              </Link>
            }
          >
            <DataTable
              columns={[
                {
                  header: "Resident",
                  render: (a: Appointment) =>
                    a.resident ? `${a.resident.first_name} ${a.resident.last_name}` : "—",
                },
                {
                  header: "When",
                  render: (a: Appointment) => formatWallClock(a.scheduled_datetime),
                },
                { header: "Status", render: (a: Appointment) => <StatusBadge status={a.status} /> },
              ]}
              rows={appointments.slice(0, 6)}
              rowKey={(a) => a.id}
              numbered
              total={appointments.slice(0, 6).length}
              emptyMessage="No upcoming appointments."
            />
          </Card>
        </div>

        {/* Documents awaiting signature & referrals requiring action */}
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card
            title="Documents awaiting your signature"
            action={
              <Link to="/records" className="text-sm font-medium text-primary hover:underline">
                Open records
              </Link>
            }
          >
            {(exec?.documents_awaiting_signature ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                No documents waiting for adoption.
              </p>
            ) : (
              <ul className="divide-y divide-gray/70">
                {exec?.documents_awaiting_signature.map((doc) => (
                  <li key={doc.id} className="py-3">
                    <p className="truncate text-sm font-semibold text-dark">
                      {doc.document_number} — {doc.document_title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {doc.document_type} · {asDate(doc.document_date)}
                      {doc.creator && ` · filed by ${doc.creator.name}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

        </div>

        {/* Office workload, aging requests, most-requested services */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card title="Office workload">
            {Object.keys(exec?.office_workload ?? {}).length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No open work anywhere.</p>
            ) : (
              <dl className="divide-y divide-gray/70 text-sm">
                {Object.entries(exec?.office_workload ?? {})
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([office, load]) => (
                    <div key={office} className="flex items-center justify-between py-2.5">
                      <dt className="min-w-0">
                        <span className="block truncate text-dark">{office}</span>
                        <span className="text-xs text-gray-400">
                          {load.pending} pending · {load.in_progress} in progress
                        </span>
                      </dt>
                      <dd className="shrink-0 font-bold text-primary">{load.total}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </Card>

          <Card title="Aging requests">
            <dl className="divide-y divide-gray/70 text-sm">
              {Object.entries(exec?.aging_requests ?? {}).map(([bucket, count]) => (
                <div key={bucket} className="flex items-center justify-between py-2.5">
                  <dt className="text-gray-500">{bucket}</dt>
                  <dd className={`font-bold ${AGING_TONES[bucket] ?? "text-dark"}`}>{count}</dd>
                </div>
              ))}
            </dl>
            {exec?.oldest_open_request ? (
              <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
                Oldest open: <span className="font-semibold text-dark">
                  {exec.oldest_open_request.request_number}
                </span>{" "}
                ({exec.oldest_open_request.service_type}, {exec.oldest_open_request.office}) —{" "}
                {exec.oldest_open_request.days_open} day(s).
              </p>
            ) : (
              <p className="mt-4 text-center text-xs text-gray-400">Nothing open.</p>
            )}
          </Card>

          <Card title="Most requested services">
            {(exec?.frequently_requested ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No requests this year.</p>
            ) : (
              <dl className="divide-y divide-gray/70 text-sm">
                {exec?.frequently_requested.map((s) => (
                  <div key={s.service_type} className="flex items-center justify-between py-2.5">
                    <dt className="min-w-0 truncate pr-3 text-dark">{s.service_type}</dt>
                    <dd className="shrink-0 font-bold text-primary">{s.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </div>

        {/* Barangay service statistics */}
        <Card title="Barangay service statistics" className="mt-6">
          <div className="grid gap-4 text-center sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Open requests", exec?.service_statistics.open_requests ?? 0],
              ["Completed this month", exec?.service_statistics.completed_this_month ?? 0],
              ["Certificates released", exec?.service_statistics.certificates_released_this_month ?? 0],
              ["Residents served", exec?.service_statistics.residents_served_this_month ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-2xl bg-secondary p-5">
                <p className="text-3xl font-extrabold text-primary">{value}</p>
                <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Counts cover the current month, except open requests which are live.
          </p>
        </Card>

        {/* Executive instructions & announcements */}
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card
            title="Executive instructions"
            action={
              <Link to="/records" className="text-sm font-medium text-primary hover:underline">
                File a directive
              </Link>
            }
          >
            {(exec?.recent_directives ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                No executive orders or memoranda adopted yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray/70">
                {exec?.recent_directives.map((d) => (
                  <li key={d.id} className="py-3">
                    <p className="truncate text-sm font-semibold text-dark">
                      {d.document_number} — {d.document_title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {d.document_type} · {asDate(d.document_date)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Latest announcements">
            {(exec?.announcements ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nothing published yet.</p>
            ) : (
              <ul className="divide-y divide-gray/70">
                {exec?.announcements.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                    <p className="min-w-0 truncate text-sm text-dark">{a.title}</p>
                    <span className="shrink-0 text-xs text-gray-400">{asDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Main Office Dashboard"
        subtitle="Today's queue and pending work for the Main Barangay Office"
      />

      {/* The two certificate tiles are the clerk's own worklist: requests
          nobody has started, and signed documents waiting to be collected. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Pending Requests" value={stats.pending_requests ?? 0} icon={FiClipboard} tone="warning" />
        <StatTile label="Certificates To Start" value={stats.pending_certificates ?? 0} icon={FiClock} tone="danger" />
        <StatTile label="Ready To Claim" value={stats.ready_to_claim ?? 0} icon={FiCheckCircle} tone="success" />
        <StatTile label="Certificates This Month" value={stats.monthly_certificates ?? 0} icon={FiAward} />
        <StatTile label="Unassigned Requests" value={stats.unassigned_requests ?? 0} icon={FiClipboard} />
      </div>

      <div className="mt-6">
        <Card
          title="Recent service requests"
          action={
            <Link to="/services" className="text-sm font-medium text-primary hover:underline">
              Open queue
            </Link>
          }
        >
          <DataTable
            columns={[
              { header: "Request #", render: (r: ServiceRequest) => <span className="font-medium text-dark">{r.request_number}</span> },
              { header: "Service", render: (r: ServiceRequest) => r.service_type },
              { header: "Status", render: (r: ServiceRequest) => <StatusBadge status={r.status} /> },
            ]}
            rows={recent}
            rowKey={(r) => r.id}
            numbered
            emptyMessage="No recent requests."
          />
        </Card>
      </div>
    </div>
  );
}
