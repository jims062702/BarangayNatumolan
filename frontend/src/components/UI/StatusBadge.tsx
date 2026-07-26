const STATUS_TONES: Record<string, string> = {
  // Generic / requests
  Pending: "bg-warning/10 text-warning",
  "In Progress": "bg-primary/10 text-primary",
  Approved: "bg-success/10 text-success",
  Completed: "bg-success/10 text-success",
  Rejected: "bg-danger/10 text-danger",
  Cancelled: "bg-gray text-gray-500",
  // Certificates
  Application: "bg-warning/10 text-warning",
  Verification: "bg-primary/10 text-primary",
  Printed: "bg-primary/10 text-primary",
  Released: "bg-success/10 text-success",
  // Appointments
  Scheduled: "bg-primary/10 text-primary",
  Confirmed: "bg-success/10 text-success",
  "No-show": "bg-danger/10 text-danger",
  // Cases
  Active: "bg-primary/10 text-primary",
  Closed: "bg-gray text-gray-500",
  Filed: "bg-warning/10 text-warning",
  Mediation: "bg-primary/10 text-primary",
  Conciliation: "bg-primary/10 text-primary",
  Arbitration: "bg-warning/10 text-warning",
  Settled: "bg-success/10 text-success",
  Dismissed: "bg-gray text-gray-500",
  Referred: "bg-danger/10 text-danger",
  Accepted: "bg-success/10 text-success",
  // Settlements
  "Within Repudiation Period": "bg-warning/10 text-warning",
  Final: "bg-success/10 text-success",
  Repudiated: "bg-danger/10 text-danger",
  Complied: "bg-success/10 text-success",
  "Not Complied": "bg-danger/10 text-danger",
  Executed: "bg-primary/10 text-primary",
  // Health
  Missed: "bg-danger/10 text-danger",
  Rescheduled: "bg-warning/10 text-warning",
  // Population events
  Verified: "bg-success/10 text-success",
  // CDC / attendance
  Enrolled: "bg-success/10 text-success",
  Dropped: "bg-danger/10 text-danger",
  Present: "bg-success/10 text-success",
  Absent: "bg-danger/10 text-danger",
  Excused: "bg-warning/10 text-warning",
  // Safety
  Safe: "bg-success/10 text-success",
  "At Risk": "bg-warning/10 text-warning",
  Critical: "bg-danger/10 text-danger",
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? "bg-gray text-gray-500";

  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}
