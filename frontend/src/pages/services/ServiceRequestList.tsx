import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import type { ServiceRequest } from "../../types";

// "Approved" is gone: certificates are no longer approved by anyone, so a
// request never lands in that state. It follows the clerk's work instead.
const STATUSES = ["Pending", "In Progress", "Completed", "Rejected"];

// Statuses staff may set by hand. Completed also happens on its own when the
// linked certificate is released to the resident.
const MANUAL_MOVES = ["In Progress", "Completed", "Rejected"];
export default function ServiceRequestList() {
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  /*
   * How many sit under each status, for the chips. Of the whole list rather
   * than the page, and unmoved by which chip is picked — otherwise the
   * chosen one would read its total and every other would read zero.
   */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<ServiceRequest | null>(null);

  /*
   * `silent` is for the background timer.
   *
   * A refresh nobody asked for must not blank the page somebody is
   * reading; a first load or a filter change should still say it is
   * working. Same fetch, and only the announcement differs.
   */
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api
      .get("/service-requests", { params: { page, status: statusFilter || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
        setCounts(r.data.data.counts ?? {});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Live updates: new online requests and PB decisions appear automatically.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("service_requests", () => load(true));


  const setStatus = async (request: ServiceRequest, status: string) => {
    if (
      !(await confirmAction({
        title: `Move ${request.request_number} to "${status}"?`,
        confirmText: "Yes, update",
        danger: status === "Rejected",
      }))
    )
      return;
    try {
      const response = await api.put(`/service-requests/${request.id}`, { status });
      const updated: ServiceRequest = response.data.data;
      // Certificate-type requests get their application filed automatically
      // when processing starts — tell the clerk where it went.
      if (status === "In Progress" && updated.certificate) {
        toast(
          `${request.request_number} → In Progress. Certificate application ` +
            `${updated.certificate.certificate_number} was filed automatically — ` +
            `see Certificates & Clearances, awaiting the Punong Barangay's decision.`
        );
      } else {
        toast(`${request.request_number} → ${status}. The resident has been notified.`);
      }
      setDetail((d) => (d && d.id === request.id ? updated : d));
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const openDetail = async (request: ServiceRequest) => {
    setDetail(request); // show list data immediately
    try {
      const response = await api.get(`/service-requests/${request.id}`);
      setDetail(response.data.data);
    } catch {
      // keep the list-row data if the detail fetch fails
    }
  };

  return (
    <div>
      <PageHeader
        title="Requests & Queue"
        subtitle="Walk-in and online service requests across offices"
      />

      {/* How a request travels */}
      <div className="mb-4 rounded-2xl border border-gray bg-white px-4 py-3 text-xs leading-relaxed text-gray-500">
        <span className="font-semibold text-dark">How it works: </span>
        <span className="rounded-full bg-warning/10 px-2 py-0.5 font-semibold text-warning">Online</span>{" "}
        requests arrive as <strong>Pending</strong>, and their certificate is already waiting in
        Certificates &amp; Clearances — press <strong>Start processing</strong> here, or{" "}
        <strong>Accept &amp; start</strong> there, and the clerk owns it from that point.{" "}
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">Walk-in</span>{" "}
        certificates are filed directly in <strong>Certificates &amp; Clearances → + New certificate</strong>.
        Nobody approves anything: this status becomes <strong>Completed</strong> on its own when the
        certificate is released to the resident.
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("");
              setPage(1);
            }}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === "" ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
            }`}
          >
            All
          </button>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === status ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {status}
              {counts[status] ? <span className="ml-1.5 opacity-70">{counts[status]}</span> : null}
            </button>
          ))}
        </div>

        <DataTable
          columns={[
            {
              header: "Request #",
              render: (r: ServiceRequest) => (
                <button
                  type="button"
                  onClick={() => openDetail(r)}
                  className="cursor-pointer font-medium text-primary hover:underline"
                  title="View request details"
                >
                  {r.request_number}
                </button>
              ),
            },
            {
              header: "Resident",
              render: (r: ServiceRequest) =>
                r.resident ? `${r.resident.first_name} ${r.resident.last_name}` : "—",
            },
            { header: "Service", render: (r: ServiceRequest) => r.service_type },
            {
              header: "Purpose",
              render: (r: ServiceRequest) => (
                <span className="line-clamp-1 max-w-48 text-gray-500" title={r.purpose ?? ""}>
                  {r.purpose || "—"}
                </span>
              ),
            },
            { header: "Status", render: (r: ServiceRequest) => <StatusBadge status={r.status} /> },
            {
              header: "Move to",
              render: (r: ServiceRequest) =>
                r.status === "Pending" ? (
                  <button
                    type="button"
                    onClick={() => setStatus(r, "In Progress")}
                    className="cursor-pointer rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                  >
                    Start processing
                  </button>
                ) : r.status === "Approved" ? (
                  // A leftover from the retired approval step. The certificate
                  // itself is what moves now, so point the clerk at it.
                  <span className="text-xs text-gray-400" title="Continue this in Certificates & Clearances — the request completes when the certificate is released.">
                    Work it in Certificates
                  </span>
                ) : ["Completed", "Rejected"].includes(r.status) ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : (
                  <select
                    value=""
                    onChange={(e) => e.target.value && setStatus(r, e.target.value)}
                    className="cursor-pointer rounded-lg border border-gray bg-white px-2 py-1.5 text-xs"
                    aria-label={`Change status of ${r.request_number}`}
                  >
                    <option value="">Change…</option>
                    {MANUAL_MOVES.filter((s) => s !== r.status).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by name, request #, or service…"
          getSearchText={(r) =>
            `${r.request_number} ${
              r.resident ? `${r.resident.first_name} ${r.resident.last_name}` : ""
            } ${r.service_type} ${r.purpose ?? ""}`
          }
          filters={[{ label: "Channel", getValue: (r) => r.request_type }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Request Details" wide>
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-dark">{detail.service_type}</p>
                <p className="text-sm text-gray-500">{detail.request_number}</p>
              </div>
              <StatusBadge status={detail.status} />
            </div>

            <div className="rounded-2xl bg-secondary p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Purpose of request</p>
              <p className="mt-1 text-sm text-dark">{detail.purpose || "No purpose provided."}</p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Resident", detail.resident ? `${detail.resident.first_name} ${detail.resident.last_name}` : "Walk-in / unlinked"],
                ["Office", detail.office],
                ["Channel", detail.request_type],
                ["Filed", detail.created_at ? new Date(detail.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—"],
                ["Handled by", detail.assigned_user?.name ?? "Unassigned"],
                ["Completed", detail.completed_at ? new Date(detail.completed_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not yet completed"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray/70 px-3.5 py-2.5">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-dark">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.certificate && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Linked certificate</p>
                <p className="mt-0.5 text-sm text-dark">
                  {detail.certificate.certificate_type} — {detail.certificate.status}{" "}
                  <span className="font-mono text-xs text-gray-500">({detail.certificate.reference_number})</span>
                </p>
              </div>
            )}

            {["Approved"].includes(detail.status) ? (
              <p className="rounded-xl bg-success/10 px-4 py-3 text-sm text-dark">
                Left over from the old approval step. Carry on in{" "}
                <strong>Certificates &amp; Clearances</strong> — print it, get it signed, and this
                request completes automatically when the certificate is released.
              </p>
            ) : ["Completed", "Rejected"].includes(detail.status) ? null : (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Update status</p>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_MOVES.filter((s) => s !== detail.status).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(detail, s)}
                      className="cursor-pointer rounded-full border border-gray px-4 py-1.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                    >
                      Move to {s}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Approval/rejection is the Punong Barangay's decision — file the certificate under
                  Certificates &amp; Clearances to send it there.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
