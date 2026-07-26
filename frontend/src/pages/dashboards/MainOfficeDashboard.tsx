import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAward, FiBookOpen, FiCalendar, FiCheckCircle, FiClipboard, FiClock } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
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

/**
 * Main Office dashboard.
 * `executive` = the Punong Barangay view: certificate decisions, appointments,
 * and KP cases only (requests & the queue are the clerk's work).
 */
export default function MainOfficeDashboard({ executive = false }: Props) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<ServiceRequest[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<Certificate[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [kpCounts, setKpCounts] = useState({ hearings: 0, repudiation: 0 });
  const [message, setMessage] = useState("");

  const load = async () => {
    const [summary, pending] = await Promise.all([
      api.get("/dashboard/summary"),
      api.get("/dashboard/pending-items"),
    ]);
    setStats({ ...summary.data.data.quick_stats, ...pending.data.data });

    if (executive) {
      const [certs, appts, deadlines] = await Promise.all([
        api.get("/certificates", { params: { status: "Application" } }),
        api.get("/appointments", { params: { status: "Scheduled" } }),
        api.get("/lupon/deadlines").catch(() => null),
      ]);
      setApprovalQueue(certs.data.data.data ?? []);
      setAppointments(appts.data.data.data ?? []);
      if (deadlines) {
        setKpCounts({
          hearings: (deadlines.data.data.upcoming_hearings ?? []).length,
          repudiation: (deadlines.data.data.repudiation_window ?? []).length,
        });
      }
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

  const decide = async (certificate: Certificate, action: "approve" | "reject") => {
    let reason: string | undefined;
    if (action === "reject") {
      const answer = window.prompt(
        "Reason for rejection (the resident will be notified):",
        ""
      );
      if (answer === null) return; // cancelled
      reason = answer;
    } else if (!(await confirmAction({ title: "Approve this certificate?", confirmText: "Yes, approve" }))) {
      return;
    }
    try {
      await api.post(`/certificates/${certificate.id}/${action}`, reason !== undefined ? { reason } : {});
      setMessage(`${action === "approve" ? "Approved" : "Rejected"} ${certificate.certificate_number}`);
      await load();
    } catch (err) {
      setMessage(errorMessage(err));
    }
  };

  if (executive) {
    return (
      <div>
        <PageHeader
          title="Executive Dashboard"
          subtitle="Certificates awaiting your decision, appointments, and KP cases"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Awaiting Your Approval" value={stats.pending_certificates ?? 0} icon={FiClock} tone="danger" />
          <StatTile label="Certificates This Month" value={stats.monthly_certificates ?? 0} icon={FiAward} />
          <StatTile label="Scheduled Appointments" value={appointments.length} icon={FiCalendar} />
          <StatTile label="KP Hearings / Deadlines" value={kpCounts.hearings + kpCounts.repudiation} icon={FiBookOpen} tone="warning" />
        </div>

        {message && (
          <p className="mt-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{message}</p>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card
            title="Certificates awaiting your decision"
            action={
              <Link to="/certificates" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            }
          >
            {approvalQueue.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nothing waiting — all caught up.</p>
            ) : (
              <ul className="divide-y divide-gray/70">
                {approvalQueue.slice(0, 6).map((certificate) => (
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
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => decide(certificate, "approve")}
                        className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(certificate, "reject")}
                        className="cursor-pointer rounded-full border border-danger/40 px-4 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger hover:text-white"
                      >
                        Reject
                      </button>
                    </div>
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
              emptyMessage="No upcoming appointments."
            />
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Pending Requests" value={stats.pending_requests ?? 0} icon={FiClipboard} tone="warning" />
        <StatTile label="Certificates This Month" value={stats.monthly_certificates ?? 0} icon={FiAward} />
        <StatTile label="Awaiting Approval" value={stats.pending_certificates ?? 0} icon={FiClock} tone="danger" />
        <StatTile label="Unassigned Requests" value={stats.unassigned_requests ?? 0} icon={FiCheckCircle} tone="success" />
      </div>

      {message && (
        <p className="mt-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{message}</p>
      )}

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
            emptyMessage="No recent requests."
          />
        </Card>
      </div>
    </div>
  );
}
