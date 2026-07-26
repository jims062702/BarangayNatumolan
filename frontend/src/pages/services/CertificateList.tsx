import { useEffect, useState, type FormEvent } from "react";
import Swal from "sweetalert2";
import { api, errorMessage } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { Certificate, Resident, ServiceRequest } from "../../types";

const TYPES = [
  "Barangay Clearance",
  "Certificate of Residency",
  "Certificate of Indigency",
  "First-Time Jobseeker",
  "Certificate of Low or No Income",
  "Business Barangay Clearance",
  "Good Moral Character",
  "Other",
];

// Standard fee per certificate type (mirrors the backend fee schedule).
const FEES: Record<string, number> = {
  "Barangay Clearance": 50,
  "Certificate of Residency": 30,
  "Certificate of Indigency": 0,
  "First-Time Jobseeker": 0,
  "Certificate of Low or No Income": 0,
  "Business Barangay Clearance": 200,
  "Good Moral Character": 50,
  Other: 0,
};

// Map a requested service to a certificate type.
function toCertType(serviceType: string): string {
  if (serviceType === "First-Time Jobseeker Certification") return "First-Time Jobseeker";
  return TYPES.includes(serviceType) ? serviceType : "Other";
}

const STATUS_TABS = ["", "Application", "Approved", "Printed", "Released", "Rejected"];

function openPrintView(certificate: Certificate) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${certificate.certificate_number}</title>
    <style>body{font-family:Georgia,serif;max-width:640px;margin:40px auto;color:#1F2937}
    .head{text-align:center;border-bottom:3px double #723EC3;padding-bottom:12px}
    h1{font-size:22px;margin:16px 0 4px;color:#723EC3}h2{font-size:18px;margin-top:36px;text-align:center;text-decoration:underline}
    p{line-height:1.8;font-size:14px}.ref{margin-top:48px;font-size:12px;color:#555}
    .sig{margin-top:64px;text-align:right}.sig b{display:block;border-top:1px solid #333;padding-top:4px;width:260px;margin-left:auto}</style>
    </head><body>
    <div class="head"><p>Republic of the Philippines<br/>Province of Misamis Oriental · Municipality of Tagoloan</p>
    <h1>BARANGAY NATUMOLAN</h1><p>Office of the Punong Barangay</p></div>
    <h2>${certificate.certificate_type.toUpperCase()}</h2>
    <p>TO WHOM IT MAY CONCERN:</p>
    <p>This is to certify that <b>${certificate.resident?.first_name ?? ""} ${certificate.resident?.last_name ?? ""}</b>,
    of legal age and a resident of Barangay Natumolan, Tagoloan, Misamis Oriental, is issued this
    ${certificate.certificate_type} for the purpose of: <b>${certificate.purpose ?? "—"}</b>.</p>
    <p>Issued this ${new Date().toLocaleDateString("en-PH", { dateStyle: "long" })} at Barangay Natumolan.</p>
    <div class="sig"><b>HON. RICARDO M. BALAGTAS<br/>Punong Barangay</b></div>
    <p class="ref">Certificate No: ${certificate.certificate_number} · Verification Ref: ${certificate.reference_number}<br/>
    Verify authenticity at the barangay website → Certificate Verification.</p>
    <script>window.print()</script></body></html>`);
  win.document.close();
}

export default function CertificateList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Certificate[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const [detail, setDetail] = useState<Certificate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [certResident, setCertResident] = useState<Resident | null>(null);
  const [residentRequests, setResidentRequests] = useState<ServiceRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState(""); // "" = walk-in
  const [certType, setCertType] = useState(TYPES[0]);
  const [purpose, setPurpose] = useState("");
  const [fee, setFee] = useState("50");
  const [exempt, setExempt] = useState(false);
  const [exemptReason, setExemptReason] = useState("");
  const [saving, setSaving] = useState(false);

  const isPB = user?.role === "Punong Barangay";

  const load = () => {
    setLoading(true);
    api
      .get("/certificates", { params: { page, status: statusFilter || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Live updates: PB approvals/rejections appear without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  const resetCreateForm = () => {
    setCertResident(null);
    setResidentRequests([]);
    setSelectedRequestId("");
    setCertType(TYPES[0]);
    setPurpose("");
    setFee(String(FEES[TYPES[0]] ?? 0));
    setExempt(false);
    setExemptReason("");
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  // When a resident is picked, load their PENDING requests so a certificate
  // can be started from one (type auto-fills). In-Progress requests are
  // excluded — their certificate was already filed automatically when the
  // clerk pressed "Start processing". Empty = walk-in.
  const pickResident = async (resident: Resident | null) => {
    setCertResident(resident);
    setSelectedRequestId("");
    setResidentRequests([]);
    if (!resident) return;
    try {
      const response = await api.get("/service-requests", {
        params: { resident_id: resident.id },
      });
      const open = (response.data.data.data ?? []).filter(
        (r: ServiceRequest) => r.status === "Pending"
      );
      setResidentRequests(open);
    } catch {
      setResidentRequests([]);
    }
  };

  // Choosing an existing request auto-fills the type, purpose, and fee.
  const chooseRequest = (requestId: string) => {
    setSelectedRequestId(requestId);
    const request = residentRequests.find((r) => String(r.id) === requestId);
    if (request) {
      const type = toCertType(request.service_type);
      setCertType(type);
      setFee(String(FEES[type] ?? 0));
      if (request.purpose) setPurpose(request.purpose);
    }
  };

  // Changing the type re-applies the standard fee (unless exempt).
  const changeType = (type: string) => {
    setCertType(type);
    if (!exempt) setFee(String(FEES[type] ?? 0));
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!certResident) return;
    setFeedback("");
    setSaving(true);
    try {
      await api.post("/certificates", {
        resident_id: certResident.id,
        service_request_id: selectedRequestId ? Number(selectedRequestId) : undefined,
        certificate_type: certType,
        purpose,
        fee_amount: exempt ? 0 : Number(fee),
        is_exempt: exempt,
        exemption_reason: exempt ? exemptReason : undefined,
      });
      setCreateOpen(false);
      setFeedback(
        selectedRequestId
          ? "Certificate application filed — sent to the Punong Barangay for decision."
          : "Walk-in certificate application filed — sent to the Punong Barangay for decision."
      );
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const act = async (
    certificate: Certificate,
    action: "approve" | "reject" | "release" | "reprint"
  ) => {
    let body: Record<string, string> | undefined;
    if (action === "reject") {
      const reason = window.prompt("Reason for rejection (the resident will be notified):", "");
      if (reason === null) return; // cancelled
      body = { reason };
    }
    setFeedback("");
    try {
      await api.post(`/certificates/${certificate.id}/${action}`, body);
      setFeedback(`${certificate.certificate_number}: ${action} successful.`);
      setDetail(null);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  // Approved certificate → open the printout, then confirm it printed OK.
  // Only on "Yes" is it marked Printed, which reveals the Release button.
  const printAndConfirm = async (certificate: Certificate) => {
    openPrintView(certificate);
    const result = await Swal.fire({
      title: "Did the certificate print successfully?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, it printed successfully",
      cancelButtonText: "No, cancel",
      confirmButtonColor: "#723EC3",
      cancelButtonColor: "#6B7280",
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    setFeedback("");
    try {
      await api.post(`/certificates/${certificate.id}/mark-printed`);
      setFeedback(`${certificate.certificate_number}: printed — it can now be released.`);
      setDetail(null);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  const openDetail = async (certificate: Certificate) => {
    setDetail(certificate); // show list data immediately
    try {
      const response = await api.get(`/certificates/${certificate.id}`);
      setDetail(response.data.data);
    } catch {
      // keep the list-row data if the detail fetch fails
    }
  };

  return (
    <div>
      <PageHeader
        title="Certificates & Clearances"
        subtitle="Application → PB approval → release, with public QR/reference verification"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + New certificate
          </button>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      {/* How the workflow moves */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray bg-white px-4 py-3 text-xs">
        <span className="font-semibold text-dark">Workflow:</span>
        <span className="rounded-full bg-warning/10 px-2.5 py-1 font-semibold text-warning">1. Application</span>
        <span className="text-gray-400">→</span>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">2. PB approves / rejects</span>
        <span className="text-gray-400">→</span>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">3. Print &amp; confirm</span>
        <span className="text-gray-400">→</span>
        <span className="rounded-full bg-success/10 px-2.5 py-1 font-semibold text-success">4. Release</span>
        <span className="ml-1 text-gray-400">
          — the clerk files the application; the Punong Barangay decides; the clerk prints the approved
          certificate and confirms it came out right — only then can it be released. The linked request's
          status follows automatically.
        </span>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((status) => (
            <button
              key={status || "all"}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === status ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {status || "All"}
            </button>
          ))}
        </div>

        <DataTable
          columns={[
            {
              header: "Certificate #",
              render: (c: Certificate) => (
                <button
                  type="button"
                  onClick={() => openDetail(c)}
                  className="cursor-pointer text-left hover:underline"
                  title="View certificate details"
                >
                  <span className="block font-medium text-primary">{c.certificate_number}</span>
                  <span className="block font-mono text-[11px] text-gray-400">{c.reference_number}</span>
                </button>
              ),
            },
            {
              header: "Resident",
              render: (c: Certificate) =>
                c.resident ? `${c.resident.first_name} ${c.resident.last_name}` : "—",
            },
            { header: "Type", render: (c: Certificate) => c.certificate_type },
            {
              header: "Fee",
              render: (c: Certificate) =>
                c.is_exempt ? (
                  <span className="text-xs font-semibold text-success">Exempt</span>
                ) : (
                  `₱${Number(c.fee_amount).toFixed(2)}`
                ),
            },
            { header: "Status", render: (c: Certificate) => <StatusBadge status={c.status} /> },
            {
              header: "Actions",
              render: (c: Certificate) => (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openDetail(c)}
                    className="cursor-pointer rounded-full border border-gray px-3 py-1 text-xs font-semibold text-dark hover:border-primary hover:text-primary"
                  >
                    View
                  </button>
                  {c.status === "Application" && isPB && (
                    <>
                      <button
                        type="button"
                        onClick={() => act(c, "approve")}
                        className="cursor-pointer rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => act(c, "reject")}
                        className="cursor-pointer rounded-full border border-danger/40 px-3 py-1 text-xs font-semibold text-danger hover:bg-danger hover:text-white"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {c.status === "Application" && !isPB && (
                    <span
                      className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning"
                      title="This application is waiting for the Punong Barangay to approve it. Log in as the Punong Barangay to approve, then release."
                    >
                      Awaiting PB approval
                    </span>
                  )}
                  {c.status === "Approved" && (
                    // Release only appears after a successful print (below).
                    <button
                      type="button"
                      onClick={() => printAndConfirm(c)}
                      className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
                    >
                      Print
                    </button>
                  )}
                  {c.status === "Printed" && (
                    <>
                      <button
                        type="button"
                        onClick={() => openPrintView(c)}
                        className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
                      >
                        Print again
                      </button>
                      <button
                        type="button"
                        onClick={() => act(c, "release")}
                        className="cursor-pointer rounded-full bg-success px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                      >
                        Release
                      </button>
                    </>
                  )}
                  {c.status === "Released" && (
                    <>
                      <button
                        type="button"
                        onClick={() => openPrintView(c)}
                        className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => act(c, "reprint")}
                        className="cursor-pointer rounded-full border border-gray px-3 py-1 text-xs font-semibold text-gray-500 hover:border-primary hover:text-primary"
                        title={`Reprints: ${c.reprint_count}`}
                      >
                        Log reprint
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          searchable
          searchPlaceholder="Search by name, certificate #, or reference…"
          getSearchText={(c) =>
            `${c.certificate_number} ${c.reference_number} ${
              c.resident ? `${c.resident.first_name} ${c.resident.last_name}` : ""
            } ${c.certificate_type}`
          }
          filters={[{ label: "Type", getValue: (c) => c.certificate_type }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Certificate" wide>
        <form onSubmit={create} className="space-y-4">
          <FormField label="Resident" required hint="Search by name or resident number — works for walk-ins too">
            <ResidentPicker value={certResident} onChange={pickResident} />
          </FormField>

          {certResident && (
            <div className="rounded-xl border border-gray bg-secondary p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Start from an existing request
              </p>
              {residentRequests.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No <strong>pending</strong> requests — this will be recorded as a{" "}
                  <strong>walk-in</strong>. Choose the certificate type below.
                  (In-Progress requests are not listed: their certificate was
                  already filed automatically.)
                </p>
              ) : (
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                    <input
                      type="radio"
                      name="req"
                      checked={selectedRequestId === ""}
                      onChange={() => setSelectedRequestId("")}
                      className="accent-primary"
                    />
                    Walk-in (no existing request)
                  </label>
                  {residentRequests.map((r) => (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white"
                    >
                      <input
                        type="radio"
                        name="req"
                        checked={selectedRequestId === String(r.id)}
                        onChange={() => chooseRequest(String(r.id))}
                        className="accent-primary"
                      />
                      <span>
                        <span className="font-medium text-dark">{r.service_type}</span>{" "}
                        <span className="text-xs text-gray-500">
                          ({r.request_number} · {r.status})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Certificate type" required hint="Auto-filled from the request; change if needed">
              <select value={certType} onChange={(e) => changeType(e.target.value)} className={inputClasses}>
                {TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Fee (₱)" hint="Auto-set from the type">
              <input
                type="number"
                min="0"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                disabled={exempt}
                className={inputClasses}
              />
            </FormField>
          </div>

          <FormField label="Purpose" required>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} required className={inputClasses} placeholder="e.g. Employment requirement" />
          </FormField>

          <FormField label="Fee exemption">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
              <input
                type="checkbox"
                checked={exempt}
                onChange={(e) => {
                  setExempt(e.target.checked);
                  if (e.target.checked) setFee("0");
                  else setFee(String(FEES[certType] ?? 0));
                }}
                className="h-4 w-4 accent-primary"
              />
              Exempt from fees (indigent, first-time jobseeker, etc.)
            </label>
          </FormField>
          {exempt && (
            <FormField label="Exemption reason" required>
              <input
                value={exemptReason}
                onChange={(e) => setExemptReason(e.target.value)}
                required
                className={inputClasses}
                placeholder="e.g. Indigent, First-time jobseeker (RA 11261)"
              />
            </FormField>
          )}

          <button
            type="submit"
            disabled={!certResident || saving}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create certificate application"}
          </button>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Certificate Details" wide>
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-dark">{detail.certificate_type}</p>
                <p className="text-sm text-gray-500">
                  {detail.certificate_number} · Ref{" "}
                  <span className="font-mono">{detail.reference_number}</span>
                </p>
              </div>
              <StatusBadge status={detail.status} />
            </div>

            {/* progress */}
            <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-secondary p-3 text-xs">
              {(() => {
                const order = ["Application", "Approved", "Printed", "Released"];
                const current = order.indexOf(detail.status);
                return order.map((stage, index) => {
                  const done = current >= 0 && index <= current;
                  return (
                    <div key={stage} className="flex items-center">
                      <span className={`rounded-full px-3 py-1 font-semibold ${done ? "bg-primary text-white" : "bg-white text-gray-400"}`}>
                        {index + 1}. {stage}
                      </span>
                      {index < order.length - 1 && <span className="mx-1 text-gray-300">→</span>}
                    </div>
                  );
                });
              })()}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Resident", detail.resident ? `${detail.resident.first_name} ${detail.resident.last_name}` : "—"],
                ["Purpose", detail.purpose ?? "—"],
                ["Fee", detail.is_exempt ? `Exempt${detail.exemption_reason ? ` — ${detail.exemption_reason}` : ""}` : `₱${Number(detail.fee_amount).toFixed(2)}`],
                ["Filed", detail.created_at ? new Date(detail.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—"],
                ["Approved", detail.approved_at ? new Date(detail.approved_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not yet approved"],
                ["Released", detail.released_at ? new Date(detail.released_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not yet released"],
                ["Reprints", String(detail.reprint_count ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray/70 px-3.5 py-2.5">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-dark">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.status === "Application" && (
              <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-dark">
                {isPB
                  ? "This application is waiting for your decision. Approve or reject it below — approved certificates can then be printed and released."
                  : "This application is waiting for the Punong Barangay's decision. Once approved, it can be printed and released here."}
              </p>
            )}

            {detail.status === "Approved" && (
              <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-dark">
                Approved — <strong>print the certificate</strong>, then confirm it printed correctly.
                The Release button appears only after a successful print.
              </p>
            )}

            {detail.status === "Printed" && (
              <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-dark">
                Printed successfully — you can now <strong>release</strong> it to the resident.
              </p>
            )}

            {detail.status === "Rejected" && (
              <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-dark">
                Rejected by the Punong Barangay
                {detail.rejection_reason ? <> — reason: <strong>{detail.rejection_reason}</strong></> : "."}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {detail.status === "Application" && isPB && (
                <>
                  <button type="button" onClick={() => act(detail, "approve")} className="cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
                    Approve certificate
                  </button>
                  <button type="button" onClick={() => act(detail, "reject")} className="cursor-pointer rounded-full border border-danger/40 px-6 py-2.5 text-sm font-semibold text-danger hover:bg-danger hover:text-white">
                    Reject certificate
                  </button>
                </>
              )}
              {detail.status === "Approved" && (
                <button type="button" onClick={() => printAndConfirm(detail)} className="cursor-pointer rounded-full border border-primary/40 px-6 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white">
                  Print certificate
                </button>
              )}
              {detail.status === "Printed" && (
                <>
                  <button type="button" onClick={() => openPrintView(detail)} className="cursor-pointer rounded-full border border-primary/40 px-6 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white">
                    Print again
                  </button>
                  <button type="button" onClick={() => act(detail, "release")} className="cursor-pointer rounded-full bg-success px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                    Release certificate
                  </button>
                </>
              )}
              {detail.status === "Released" && (
                <button type="button" onClick={() => openPrintView(detail)} className="cursor-pointer rounded-full border border-primary/40 px-6 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white">
                  Print certificate
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
