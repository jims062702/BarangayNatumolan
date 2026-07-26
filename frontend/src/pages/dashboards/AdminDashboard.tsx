import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiBell, FiHelpCircle, FiSettings, FiUserPlus, FiUsers } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import PageHeader from "../../components/UI/PageHeader";
import type { User } from "../../types";

export default function AdminDashboard() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [portalAccounts, setPortalAccounts] = useState(0);

  // Live updates: bump `tick` to re-run the fetches below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.dashboard);

  useEffect(() => {
    api
      .get("/admin/users")
      .then((r) => {
        setTotalUsers(r.data.data.total ?? 0);
        setUsers(r.data.data.data ?? []);
      })
      .catch(() => undefined);
    api
      .get("/population/accounts")
      .then((r) => setPortalAccounts(r.data.data.total ?? 0))
      .catch(() => undefined);
  }, [tick]);

  const staffCount = users.filter((u) => u.role !== "Resident").length;
  const inactive = users.filter((u) => u.is_active === false).length;

  return (
    <div>
      <PageHeader
        title="System Administration"
        subtitle="Accounts, content, and system configuration"
        actions={
          <Link
            to="/admin/users"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Manage users
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total Accounts" value={totalUsers} icon={FiUsers} />
        <StatTile label="Staff Accounts (page)" value={staffCount} icon={FiSettings} tone="success" />
        <StatTile label="Resident Portal Accounts" value={portalAccounts} icon={FiUserPlus} tone="warning" />
        <StatTile label="Deactivated (page)" value={inactive} icon={FiBell} tone="danger" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Administration shortcuts">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { to: "/admin/users", label: "User Accounts", icon: FiSettings },
              { to: "/population/accounts", label: "Portal Accounts", icon: FiUserPlus },
              { to: "/manage/announcements", label: "Announcements", icon: FiBell },
              { to: "/manage/service-guides", label: "Service Guides", icon: FiHelpCircle },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl border border-gray px-4 py-3 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
              >
                <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Access-control reminders">
          <ul className="list-inside list-disc space-y-2 text-sm text-gray-600">
            <li>VAWC case content is restricted to the VAWC office — even administrators cannot read it.</li>
            <li>Health records are visible to Health Station personnel only.</li>
            <li>Resident portal accounts are created by the Population Office after residency verification.</li>
            <li>General reports expose aggregated, anonymized figures only.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
