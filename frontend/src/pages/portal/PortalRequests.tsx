import { useEffect, useState, type FormEvent } from "react";
import { FiPlus } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { ServiceRequest } from "../../types";

/**
 * Everything the resident has asked the barangay for — one list.
 *
 * This used to be two pages. "My Requests" showed the request and "My
 * Certificates" showed the document that came out of it: the same event,
 * listed twice, under two different reference numbers. Worse, the two
 * disagreed — a certificate the clerk had marked READY TO CLAIM was still
 * shown as "In Progress" on the requests page, because that page read the
 * request's status while the counter had moved the certificate's.
 *
 * A resident cannot reconcile two screens. So there is one, and where a
 * request has produced a document, the DOCUMENT's status is what it says —
 * that is the record that knows whether the paper exists.
 */

/** One certificate type a resident can ask for, with what it takes. */
interface CertificateService {
  certificate_type: string;
  /*
   * Null where the ordinance prices by purpose rather than by document.
   * A Barangay Clearance is ₱20 for a filing fee and ₱200 for a Mayor's
   * Permit, so there is no one number to quote — and quoting one would be
   * telling most residents the wrong amount before they walk over.
   */
  fee: number | null;
  fee_varies?: boolean;
  description?: string | null;
  requirements: string[];
  schedule?: string | null;
}

const peso = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "Set at the counter";

  return amount === 0 ? "Free" : `₱${amount.toFixed(2)}`;
};

export default function PortalRequests() {
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [services, setServices] = useState<CertificateService[]>([]);
  const [serviceType, setServiceType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);

  const load = (p = page) => {
    setLoading(true);
    api
      .get("/portal/requests", { params: { page: p } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /*
   * The fees and requirements, fetched once. They come from the office's own
   * schedule and service guide, so what the form quotes is what the counter
   * charges.
   */
  useEffect(() => {
    api
      .get("/portal/certificate-services")
      .then((r) => {
        const list: CertificateService[] = r.data.data ?? [];
        setServices(list);
        // Pre-selected, as the form always was — but now the choice carries
        // its fee and papers, so the default is a statement rather than a
        // blank the resident has to interpret.
        if (list.length > 0) setServiceType(list[0].certificate_type);
      })
      .catch(() => setServices([]));
  }, []);

  useAutoRefresh(() => load(), REFRESH.portal);

  const chosen = services.find((s) => s.certificate_type === serviceType);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !(await confirmAction({
        title: `Request a ${serviceType}?`,
        text: chosen
          ? chosen.fee === null
            ? "The fee depends on what the clearance is for — the office will tell you at the counter."
            : `Fee at the counter: ${peso(chosen.fee)}.`
          : undefined,
        confirmText: "Yes, submit",
      }))
    )
      return;

    setSaving(true);
    try {
      await api.post("/portal/requests", { service_type: serviceType, purpose });
      setCreateOpen(false);
      setPurpose("");
      toast("Request submitted! You will be notified as it is processed.");
      setPage(1);
      load(1);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="My Requests & Certificates"
        subtitle="Everything you have asked the barangay for, and where each one has got to"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> Request a certificate
          </button>
        }
      />

      <Card>
        <DataTable
          columns={[
            {
              header: "Reference",
              /*
               * The certificate number when there is one, because that is
               * what the clerk at the counter will ask for. The request
               * number stays underneath: it is what the resident quoted
               * before the document existed.
               */
              render: (r: ServiceRequest) => (
                <span className="block">
                  <span className="font-medium text-dark">
                    {r.certificate?.certificate_number ?? r.request_number}
                  </span>
                  {r.certificate?.certificate_number && (
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      {r.request_number}
                    </span>
                  )}
                </span>
              ),
            },
            {
              header: "Service",
              render: (r: ServiceRequest) => r.certificate?.certificate_type ?? r.service_type,
            },
            {
              header: "Filed",
              render: (r: ServiceRequest) =>
                r.created_at ? new Date(r.created_at).toLocaleDateString("en-PH") : "—",
            },
            {
              header: "Fee",
              render: (r: ServiceRequest) =>
                r.certificate ? (
                  <span className="tabular-nums">{peso(Number(r.certificate.fee_amount ?? 0))}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                ),
            },
            {
              header: "Status",
              /*
               * The document's own status wins. It is the record that knows
               * whether the paper has been printed, and it is what the clerk
               * is looking at — two screens that disagree about one document
               * is worse than either of them alone.
               */
              render: (r: ServiceRequest) => (
                <StatusBadge status={r.certificate?.status ?? r.status} />
              ),
            },
            {
              header: "Verification ref.",
              render: (r: ServiceRequest) =>
                r.certificate?.reference_number ? (
                  <span className="font-mono text-xs text-primary">
                    {r.certificate.reference_number}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="You have not asked for anything yet."
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          total={total}
          perPage={15}
          numbered
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Request a certificate">
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Which certificate?" required>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className={inputClasses}
            >
              {services.map((s) => (
                <option key={s.certificate_type} value={s.certificate_type}>
                  {s.certificate_type} — {peso(s.fee)}
                </option>
              ))}
            </select>
          </FormField>

          {/*
            The fee and the papers, before the walk.

            A resident used to pick a name from a list, walk to the office,
            and find out at the counter that they needed a valid ID and ₱50.
            For somebody who walked half an hour to get there, that is the
            whole morning gone.
          */}
          {chosen && (
            <div className="rounded-xl border border-gray bg-secondary/50 p-4">
              {chosen.description && (
                <p className="mb-3 text-xs leading-relaxed text-gray-600">{chosen.description}</p>
              )}

              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="text-gray-500">Fee at the counter:</span>
                <span className="font-bold text-dark">{peso(chosen.fee)}</span>
              </div>

              {chosen.fee === null && (
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  This one is priced by what it is for — from ₱20 to ₱200 under the barangay
                  ordinance. The office works it out when you say what you need it for.
                </p>
              )}

              <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Bring with you
              </p>
              {chosen.requirements.length > 0 ? (
                <ul className="list-inside list-disc space-y-0.5 text-xs text-dark">
                  {chosen.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">
                  Nothing listed for this one — bring a valid ID and the office will tell you if
                  anything else is needed.
                </p>
              )}

              {chosen.schedule && (
                <p className="mt-3 text-xs text-gray-500">Office hours: {chosen.schedule}</p>
              )}
            </div>
          )}

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
            disabled={saving || !serviceType}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
