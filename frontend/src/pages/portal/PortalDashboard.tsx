import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAward, FiCalendar, FiClipboard, FiFileText, FiHelpCircle, FiSearch } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import type { Announcement, Appointment, Resident, ServiceRequest } from "../../types";
import RevealGroup from "../../components/UI/RevealGroup";

interface PortalHome {
  resident: Resident;
  stats: {
    active_requests: number;
    total_requests: number;
    upcoming_appointments: number;
    certificates_ready: number;
  };
  recent_requests: ServiceRequest[];
  upcoming_appointments: Appointment[];
  announcements: Announcement[];
}

export default function PortalDashboard() {
  const { user } = useAuth();
  const [home, setHome] = useState<PortalHome | null>(null);

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.portal);

  useEffect(() => {
    api.get("/portal/dashboard").then((r) => setHome(r.data.data)).catch(() => undefined);
  }, [tick]);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name?.split(" ")[0] ?? "Resident"}!`}
        subtitle={
          home
            ? `Resident No. ${home.resident?.resident_number} · ${home.resident?.zone_purok ?? ""}`
            : "Your barangay services, online"
        }
      />

      <RevealGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active Requests" value={home?.stats.active_requests ?? 0} icon={FiClipboard} tone="warning" />
        <StatTile label="Total Requests" value={home?.stats.total_requests ?? 0} icon={FiFileText} />
        <StatTile label="Upcoming Appointments" value={home?.stats.upcoming_appointments ?? 0} icon={FiCalendar} tone="success" />
        <StatTile label="Certificates Ready" value={home?.stats.certificates_ready ?? 0} icon={FiAward} tone="danger" />
      </RevealGroup>

      <Card title="Quick actions" className="mt-6">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/portal/requests"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Request a certificate
          </Link>
          <Link
            to="/portal/appointments"
            className="rounded-full border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Book an appointment
          </Link>
          <Link
            to="/portal/assistant"
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <FiHelpCircle aria-hidden="true" /> Ask the service guide
          </Link>
          {/* Link, not <a>: a full reload throws away the verified
              session and the page comes back looking signed out. */}
          <Link
            to="/verify"
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <FiSearch aria-hidden="true" /> Verify a certificate
          </Link>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="My recent requests"
          action={
            <Link to="/portal/requests" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          {(home?.recent_requests ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No requests yet — start one above.</p>
          ) : (
            <ul className="divide-y divide-gray/70">
              {home?.recent_requests.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-dark">{request.service_type}</p>
                    <p className="text-xs text-gray-500">{request.request_number}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Latest announcements"
          action={
            <Link to="/portal/announcements" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          {(home?.announcements ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No announcements right now.</p>
          ) : (
            <ul className="divide-y divide-gray/70">
              {home?.announcements.map((announcement) => (
                <li key={announcement.id} className="py-3">
                  <p className="text-sm font-semibold text-dark">{announcement.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{announcement.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
