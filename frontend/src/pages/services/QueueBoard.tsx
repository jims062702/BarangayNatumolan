import { useEffect, useState, type FormEvent } from "react";
import { FiClock, FiUserCheck, FiUsers, FiVolume2 } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatTile from "../../components/UI/StatTile";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { QueueEntry, QueueSummary, ServiceRequest } from "../../types";

const today = () => new Date().toISOString().slice(0, 10);

const asTime = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "—";

const entryName = (e: QueueEntry) =>
  e.resident ? `${e.resident.first_name} ${e.resident.last_name}` : "—";

export default function QueueBoard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(true);

  // "Issue number" picks from requests that are still being served today.
  const [issueOpen, setIssueOpen] = useState(false);
  const [openRequests, setOpenRequests] = useState<ServiceRequest[]>([]);
  const [requestId, setRequestId] = useState("");
  const [notes, setNotes] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/queue", { params: { date } })
      .then((r) => {
        setEntries(r.data.data.entries ?? []);
        setSummary(r.data.data.summary ?? null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useAutoRefresh(load, REFRESH.staff);

  const openIssue = async () => {
    setIssueOpen(true);
    setRequestId("");
    setNotes("");
    try {
      const response = await api.get("/service-requests", {
        params: { office: user?.office, status: "Pending" },
      });
      // Only requests tied to a resident can be queued — the board calls
      // people by name, and the queue table requires the resident link.
      setOpenRequests((response.data.data.data ?? []).filter((r: ServiceRequest) => r.resident_id));
    } catch {
      setOpenRequests([]);
    }
  };

  const issue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await api.post("/queue", {
        service_request_id: Number(requestId),
        notes: notes || null,
      });
      setIssueOpen(false);
      toast(response.data.message);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const act = async (entry: QueueEntry, action: string, label: string, danger = false) => {
    if (
      !(await confirmAction({
        title: `${label} ${entry.queue_number}?`,
        confirmText: `Yes, ${label.toLowerCase()}`,
        danger,
      }))
    )
      return;
    try {
      const response = await api.post(`/queue/${entry.id}/${action}`);
      toast(response.data.message);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const remove = async (entry: QueueEntry) => {
    if (
      !(await confirmAction({
        title: `Remove ${entry.queue_number}?`,
        text: "For a number issued by mistake. Once called or served it stays on the record.",
        confirmText: "Yes, remove",
        danger: true,
      }))
    )
      return;
    try {
      await api.delete(`/queue/${entry.id}`);
      toast(`${entry.queue_number} removed.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Service Queue"
        subtitle={`Walk-in window numbers for ${user?.office ?? "your office"}`}
        actions={
          <>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Queue date"
              className="cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <button
              type="button"
              onClick={openIssue}
              className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              + Issue number
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Now serving"
          value={summary?.now_serving ?? "—"}
          icon={FiUserCheck}
          tone="success"
        />
        <StatTile label="Waiting" value={summary?.waiting ?? 0} icon={FiUsers} tone="warning" />
        <StatTile label="Served today" value={summary?.completed ?? 0} icon={FiVolume2} />
        <StatTile
          label="Average wait"
          value={`${summary?.average_wait_minutes ?? 0} min`}
          icon={FiClock}
          hint="Queued until called to the window"
        />
      </div>

      <Card>
        <DataTable
          columns={[
            {
              header: "No.",
              render: (e: QueueEntry) => (
                <span className="font-bold text-primary">{e.queue_number}</span>
              ),
            },
            { header: "Resident", render: entryName },
            {
              header: "Service",
              render: (e: QueueEntry) => e.service_request?.service_type ?? "—",
            },
            { header: "Queued", render: (e: QueueEntry) => asTime(e.queue_time) },
            {
              header: "Waited",
              render: (e: QueueEntry) =>
                e.wait_time_minutes !== null && e.wait_time_minutes !== undefined
                  ? `${e.wait_time_minutes} min`
                  : "—",
            },
            { header: "Status", render: (e: QueueEntry) => <StatusBadge status={e.status} /> },
            {
              header: "Actions",
              render: (e: QueueEntry) => (
                <div className="flex flex-wrap gap-1.5">
                  {e.status === "Waiting" && (
                    <button
                      type="button"
                      onClick={() => act(e, "call", "Call")}
                      className="cursor-pointer rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark"
                    >
                      Call
                    </button>
                  )}
                  {(e.status === "Waiting" || e.status === "Called") && (
                    <button
                      type="button"
                      onClick={() => act(e, "serve", "Serve")}
                      className="cursor-pointer rounded-full bg-success px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Serve
                    </button>
                  )}
                  {e.status === "Serving" && (
                    <button
                      type="button"
                      onClick={() => act(e, "complete", "Complete")}
                      className="cursor-pointer rounded-full bg-success px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Complete
                    </button>
                  )}
                  {e.status === "Waiting" && (
                    <button
                      type="button"
                      onClick={() => remove(e)}
                      className="cursor-pointer rounded-full border border-danger/40 px-3 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger hover:text-white"
                    >
                      Remove
                    </button>
                  )}
                  {!["Completed", "Absent"].includes(e.status) && (
                    <button
                      type="button"
                      onClick={() => act(e, "absent", "Mark absent", true)}
                      className="cursor-pointer rounded-full border border-danger/40 px-3 py-1 text-xs font-semibold text-danger hover:bg-danger hover:text-white"
                    >
                      Absent
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={entries}
          rowKey={(e) => e.id}
          searchable
          searchPlaceholder="Search by number, resident or service…"
          getSearchText={(e) =>
            `${e.queue_number} ${entryName(e)} ${e.service_request?.service_type ?? ""}`
          }
          filters={[{ label: "Status", getValue: (e) => e.status }]}
          loading={loading}
          emptyMessage="No one in the queue for this date."
        />
      </Card>

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Issue Queue Number">
        <form onSubmit={issue} className="space-y-4">
          <FormField
            label="Pending request"
            required
            hint="Only requests already linked to a resident can be queued."
          >
            <select
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              required
              className={inputClasses}
            >
              <option value="">Select a request…</option>
              {openRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.request_number} — {r.service_type}
                  {r.resident ? ` (${r.resident.first_name} ${r.resident.last_name})` : ""}
                </option>
              ))}
            </select>
          </FormField>
          {openRequests.length === 0 && (
            <p className="rounded-xl bg-warning/10 px-4 py-2.5 text-xs text-warning">
              No pending requests with a linked resident. Record the request in
              Requests &amp; Queue first.
            </p>
          )}
          <FormField label="Notes">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClasses}
              placeholder="Optional — e.g. senior citizen, priority lane"
            />
          </FormField>
          <button
            type="submit"
            disabled={!requestId}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Issue number
          </button>
        </form>
      </Modal>
    </div>
  );
}
