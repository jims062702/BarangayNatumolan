import { useEffect, useState } from "react";
import { FiClock, FiClipboard, FiCheckCircle, FiShare2 } from "react-icons/fi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";

interface ServiceStatistics {
  period: { month: string | number; year: string | number };
  total_requests: number;
  by_status: { completed: number; pending: number; rejected: number; in_progress: number };
  by_office: Record<string, number>;
  by_service_type: Record<string, number>;
  completion_rate: number;
  average_processing_time: number;
}

interface ReferralStatistics {
  total: number;
  by_status: Record<string, number>;
  by_receiving_office: Record<string, number>;
  acknowledgment_rate: number;
  pending_followups: number;
}

interface RecordStatistics {
  total: number;
  approved: number;
  awaiting_approval: number;
  archived: number;
  by_type: Record<string, number>;
  this_year: number;
}

// Magnitude = one brand hue. Status = categorical (CVD-validated set).
const PRIMARY = "#723EC3";
const STATUS_COLORS: Record<string, string> = {
  Completed: "#16A34A",
  "In Progress": "#723EC3",
  Pending: "#E8892B",
  Rejected: "#DC2626",
};
const AXIS = "#9CA3AF"; // recessive gray-400
const GRID = "#E5E7EB"; // recessive gray-200
const tooltipStyle = { borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Object map → chart rows, biggest first, blanks dropped. */
const toRows = (map: Record<string, number> | undefined) =>
  Object.entries(map ?? {})
    .map(([label, count]) => ({ label, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

export default function ReportsAnalytics() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const [services, setServices] = useState<ServiceStatistics | null>(null);
  const [referrals, setReferrals] = useState<ReferralStatistics | null>(null);
  const [records, setRecords] = useState<RecordStatistics | null>(null);

  // The document archive belongs to the Main Office, so only those accounts
  // ask for it. Requesting it from another office would just earn a 403 and
  // fill the console with errors that look like a broken page.
  const canSeeRecords =
    user?.office === "Main Office" ||
    user?.role === "Punong Barangay" ||
    user?.role === "Admin";

  const load = () => {
    const params = { month, year };
    api
      .get("/reports/service-statistics", { params })
      .then((r) => setServices(r.data.data))
      .catch(() => setServices(null));
    api
      .get("/referrals/statistics", { params })
      .then((r) => setReferrals(r.data.data))
      .catch(() => setReferrals(null));

    if (!canSeeRecords) {
      setRecords(null);
      return;
    }
    api
      .get("/administrative-records/statistics")
      .then((r) => setRecords(r.data.data))
      .catch(() => setRecords(null));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  useAutoRefresh(load, REFRESH.dashboard);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  const officeRows = toRows(services?.by_office);
  const serviceRows = toRows(services?.by_service_type).slice(0, 8);
  const statusRows = [
    { name: "Completed", value: services?.by_status.completed ?? 0 },
    { name: "In Progress", value: services?.by_status.in_progress ?? 0 },
    { name: "Pending", value: services?.by_status.pending ?? 0 },
    { name: "Rejected", value: services?.by_status.rejected ?? 0 },
  ].filter((row) => row.value > 0);
  const referralRows = toRows(referrals?.by_receiving_office);
  const recordRows = toRows(records?.by_type);

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Barangay-wide service statistics — aggregated figures only"
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
              Print report
            </button>
          </>
        }
      />

      <div className="mb-4 rounded-2xl border border-gray bg-secondary px-4 py-3 text-xs text-gray-500">
        Confidential VAWC and health records are excluded by design. Those
        offices report from their own dashboards, in anonymized form.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total Requests" value={services?.total_requests ?? 0} icon={FiClipboard} />
        <StatTile
          label="Completion Rate"
          value={`${services?.completion_rate ?? 0}%`}
          icon={FiCheckCircle}
          tone="success"
          hint={`${MONTHS[Number(month) - 1]} ${year}`}
        />
        <StatTile
          label="Avg. Processing"
          value={`${services?.average_processing_time ?? 0} days`}
          icon={FiClock}
          tone="warning"
        />
        <StatTile
          label="Referrals Made"
          value={referrals?.total ?? 0}
          icon={FiShare2}
          tone="danger"
          hint={
            referrals
              ? `${referrals.pending_followups} follow-up(s) due`
              : "Not available for your office"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Requests by office">
          {officeRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No requests this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={officeRows}
                margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                barCategoryGap="22%"
              >
                <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} requests`, "Count"]} />
                <Bar dataKey="count" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={900} animationEasing="ease-out">
                  <LabelList dataKey="count" position="top" fontSize={11} fill="#4B5563" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Request status">
          {statusRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No requests this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={statusRows}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                  isAnimationActive
                  animationDuration={900}
                >
                  {statusRows.map((row) => (
                    <Cell key={row.name} fill={STATUS_COLORS[row.name] ?? PRIMARY} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} requests`, n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Most requested services">
          {serviceRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No requests this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, serviceRows.length * 34)}>
              <BarChart
                layout="vertical"
                data={serviceRows}
                margin={{ top: 4, right: 28, bottom: 0, left: 8 }}
                barCategoryGap="28%"
              >
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={124} />
                <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} requests`, "Count"]} />
                <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive animationDuration={900} animationEasing="ease-out">
                  <LabelList dataKey="count" position="right" fontSize={11} fill="#4B5563" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {referrals && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Referrals by receiving office">
            {referralRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No referrals this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(120, referralRows.length * 34)}>
                <BarChart
                  layout="vertical"
                  data={referralRows}
                  margin={{ top: 4, right: 28, bottom: 0, left: 8 }}
                  barCategoryGap="28%"
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={124} />
                  <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} referrals`, "Count"]} />
                  <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive animationDuration={900} animationEasing="ease-out">
                    <LabelList dataKey="count" position="right" fontSize={11} fill="#4B5563" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Referral response">
            <dl className="divide-y divide-gray/70 text-sm">
              {[
                ["Referrals made", referrals.total],
                ["Acknowledged by receiving office", `${referrals.acknowledgment_rate}%`],
                ["Follow-ups due or overdue", referrals.pending_followups],
                ["Completed", referrals.by_status?.Completed ?? 0],
                ["Not attended", referrals.by_status?.["Not Attended"] ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between py-2.5">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-semibold text-dark">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {records && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Administrative records by type">
            {recordRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No documents filed yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(120, recordRows.length * 34)}>
                <BarChart
                  layout="vertical"
                  data={recordRows}
                  margin={{ top: 4, right: 28, bottom: 0, left: 8 }}
                  barCategoryGap="28%"
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={148} />
                  <Tooltip cursor={{ fill: "rgba(114,62,195,0.06)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} document(s)`, "Count"]} />
                  <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive animationDuration={900} animationEasing="ease-out">
                    <LabelList dataKey="count" position="right" fontSize={11} fill="#4B5563" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Document archive">
            <dl className="divide-y divide-gray/70 text-sm">
              {[
                ["Documents on file", records.total],
                ["Filed this year", records.this_year],
                ["Approved", records.approved],
                ["Awaiting approval", records.awaiting_approval],
                ["Archived", records.archived],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between py-2.5">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-semibold text-dark">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}
