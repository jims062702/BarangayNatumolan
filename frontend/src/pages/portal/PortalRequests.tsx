import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { ServiceRequest } from "../../types";

const SERVICE_OPTIONS = [
  "Barangay Clearance",
  "Certificate of Residency",
  "Certificate of Indigency",
  "First-Time Jobseeker Certification",
  "Certificate of Low or No Income",
  "Business Barangay Clearance",
  "Other Barangay Service",
];

export default function PortalRequests() {
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [serviceType, setServiceType] = useState(SERVICE_OPTIONS[0]);
  const [purpose, setPurpose] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = (p = page) => {
    setLoading(true);
    api
      .get("/portal/requests", { params: { page: p } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Live updates: status changes appear without a manual refresh.
  useAutoRefresh(() => load(), REFRESH.portal);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Submit this request?", confirmText: "Yes, submit" }))) return;
    setFeedback("");
    try {
      await api.post("/portal/requests", { service_type: serviceType, purpose });
      setCreateOpen(false);
      setPurpose("");
      setFeedback("Request submitted! You will be notified as it is processed.");
      load(1);
      setPage(1);
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="My Service Requests"
        subtitle="Submit and track your barangay service requests"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + New request
          </button>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <Card>
        <DataTable
          columns={[
            {
              header: "Request #",
              render: (r: ServiceRequest) => <span className="font-medium text-dark">{r.request_number}</span>,
            },
            { header: "Service", render: (r: ServiceRequest) => r.service_type },
            { header: "Office", render: (r: ServiceRequest) => r.office },
            {
              header: "Filed",
              render: (r: ServiceRequest) =>
                r.created_at ? new Date(r.created_at).toLocaleDateString("en-PH") : "—",
            },
            { header: "Status", render: (r: ServiceRequest) => <StatusBadge status={r.status} /> },
            {
              header: "Certificate Ref.",
              render: (r: ServiceRequest) =>
                r.certificate ? (
                  <span className="font-mono text-xs text-primary">{r.certificate.reference_number}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="You have not filed any requests yet."
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Service Request">
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Service" required>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className={inputClasses}
            >
              {SERVICE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Purpose" required hint="e.g. Employment requirement, school enrollment">
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              required
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Submit request
          </button>
        </form>
      </Modal>
    </div>
  );
}
