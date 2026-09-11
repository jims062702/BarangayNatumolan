import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import { FiEye, FiPlus } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import { personName } from "../../lib/names";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import FileField from "../../components/UI/FileField";
import { useUpload } from "../../hooks/useUpload";
import type { Certificate, Resident, ServiceRequest } from "../../types";
import {
  buildCertificateHtml,
  type CouncilMember,
  type PrintableCertificate,
} from "../../lib/certificateTemplates";

/*
 * What the barangay issues and what it costs now comes from the server,
 * where the ordinance of 18 January 2020 is typed out once. It used to be
 * two lists in this file — eight types with one price each — which was the
 * wrong shape as much as the wrong numbers: a clearance is priced by what it
 * is FOR, ₱20 to ₱200, and a business clearance by the kind of business.
 */
interface CatalogueType {
  name: string;
  fee: number | null;
  fee_from: string | null;
  fee_field: string | null;
  office: string;
  letterhead: string;
  needs_photo: boolean;
  fields: string[];
}

interface Catalogue {
  types: CatalogueType[];
  clearance_purposes: Record<string, number>;
  business_kinds: Record<string, number>;
  other_certification_fee: number;
}

/** The plain-language label for each extra question a form asks. */
const FIELD_LABELS: Record<string, string> = {
  or_number: "OR number",
  officer_of_the_day: "Kagawad — officer of the day",
  business_name: "Business name",
  business_kind: "Kind of business",
  years_of_residence: "Years at this address",
  father_name: "Father's name",
  mother_name: "Mother's name",
  deceased_name: "Name of the deceased",
  deceased_age: "Age at death",
  deceased_address: "Address of the deceased",
  date_of_death: "Date of death",
  time_of_death: "Time of death",
  place_of_death: "Place of death",
  requested_by: "Requested by",
  relationship_to_deceased: "Their relationship to the deceased",
  position: "Position",
  station: "Station",
  dates_appeared: "Date/s appeared",
  partner_name: "Common law partner's name",
  years_together: "Years together",
  name_on_payroll: "Name as it appears on the payroll",
  correct_name: "The correct spelling",
  civil_status_stated: "Civil status to state",
  late_spouse_name: "Name of the late spouse",
  attached_documents: "Documents attached",
  applicant_name: "Applicant or company",
  work_applied_for: "Work applied for",
  body: "What this certifies",
};

/** A hint only where the answer's shape is not obvious from the label. */
const FIELD_HINTS: Record<string, string> = {
  time_of_death: "Written as it should print — e.g. 3:00 o'clock in the afternoon",
  relationship_to_deceased: "e.g. his son, her daughter — this prints as written",
  work_applied_for: "e.g. ELECTRICAL INSTALLATION, FENCE, HOUSE EXTENSION",
  attached_documents: "e.g. Church and Barangay Certifications of Death",
  years_of_residence: "Filled from the register when the census recorded it",
};

// Map a requested service to a certificate type the catalogue knows.
function toCertType(serviceType: string, known: string[]): string {
  if (serviceType === "First-Time Jobseeker Certification") return "First-Time Jobseeker";

  return known.includes(serviceType) ? serviceType : "Other Certification";
}

/**
 * The counter workflow, in order — three presses from request to hand-over.
 *
 * Nobody approves or rejects a certificate, and nobody clicks a signature
 * either: the resident asks, the clerk prints, the Punong Barangay signs the
 * paper on its way to the counter, and the clerk hands it over. Each stage is
 * a thing that happened to the DOCUMENT.
 */
const FLOW = ["Pending", "Processing", "Ready to Claim", "Released"];

const STATUS_TABS = ["", ...FLOW, "Cancelled"];

/** One line of plain guidance per stage, shown on the row's detail. */
const STAGE_HELP: Record<string, string> = {
  Pending:
    "A resident requested this online. Accept it to start — nothing else is waiting on anyone.",
  Processing:
    "You are preparing this certificate. Check the wording, then press Print: that prints it, tells the resident it is ready to claim, and locks the details.",
  "Ready to Claim":
    "Printed and waiting on the counter — get it signed on the way. The resident has already been notified. Release it when they collect it.",
  Released: "Handed to the resident, who has been notified. The request is complete.",
};

/**
 * Opens the barangay's own form, filled in, and prints it.
 *
 * What was here printed one paragraph under every heading — "is issued this
 * {type} for the purpose of: {purpose}" — over a signature block reading
 * HON. RICARDO M. BALAGTAS, who is a name from the demonstration data. The
 * office was never going to use it, so they kept making the real documents
 * in Word.
 */
function openPrintView(
  certificate: Certificate,
  council: CouncilMember[],
  catalogue: Catalogue | null,
) {
  const spec = catalogue?.types.find((t) => t.name === certificate.certificate_type);

  const win = window.open("", "_blank", "width=900,height=1000");

  if (!win) return;

  win.document.write(
    buildCertificateHtml(certificate as unknown as PrintableCertificate, council, {
      letterhead: spec?.letterhead ?? "plain",
      office: spec?.office ?? "Punong Barangay",
    }),
  );
  win.document.close();
}

export default function CertificateList() {
  const [rows, setRows] = useState<Certificate[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  /*
   * How many sit under each chip. Of the whole list rather than the page,
   * and unmoved by which chip is picked — otherwise the chosen one would
   * read its total and every other would read zero, which is exactly the
   * question the chips are there to answer.
   */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Certificate | null>(null);
  // Correcting a typo in the type or purpose before the document is printed.
  const [editingDetail, setEditingDetail] = useState(false);
  const [detailType, setDetailType] = useState("");
  const [detailPurpose, setDetailPurpose] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [certResident, setCertResident] = useState<Resident | null>(null);
  const [residentRequests, setResidentRequests] = useState<ServiceRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState(""); // "" = walk-in
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  /* The council that signs the paper, read from the Officials roster. */
  const [council, setCouncil] = useState<CouncilMember[]>([]);
  const [certType, setCertType] = useState("Barangay Clearance");
  /* The answers this particular form asks for beyond the register. */
  const [fields, setFields] = useState<Record<string, string>>({});
  const [purpose, setPurpose] = useState("");
  const [fee, setFee] = useState("50");
  const [exempt, setExempt] = useState(false);
  const [exemptReason, setExemptReason] = useState("");
  const [saving, setSaving] = useState(false);

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
      .get("/certificates", { params: { page, status: statusFilter || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setCounts(r.data.data.counts ?? {});
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Live updates: new online requests appear without a manual refresh.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("certificates", () => load(true));

  /*
   * Both fetched once, not per print. A clerk printing a stack of twenty
   * should not ask the server twenty times for a fee schedule that changes
   * when an ordinance does.
   */
  useEffect(() => {
    api.get("/certificates/fee-schedule").then((r) => setCatalogue(r.data.data));
    /*
     * The public roster, which returns { barangay, sk } already grouped —
     * and which every signed-in office may read. The SK chairperson is
     * folded in because the clearance sidebar lists them with the council.
     */
    api
      .get("/officials")
      .then((r) =>
        setCouncil([...(r.data.data?.barangay ?? []), ...(r.data.data?.sk ?? [])]),
      )
      .catch(() => setCouncil([]));
  }, []);

  /** What this type charges, given the answer that decides it. */
  const feeFor = (type: string, purposeText: string, answers: Record<string, string>) => {
    const spec = catalogue?.types.find((t) => t.name === type);

    if (!spec) return 0;
    if (spec.fee !== null) return spec.fee;

    const choice = spec.fee_field === "purpose" ? purposeText : answers[spec.fee_field ?? ""];
    const table =
      spec.fee_from === "clearance" ? catalogue?.clearance_purposes : catalogue?.business_kinds;

    return table?.[choice ?? ""] ?? catalogue?.other_certification_fee ?? 0;
  };

  const resetCreateForm = () => {
    setCertResident(null);
    setResidentRequests([]);
    setSelectedRequestId("");
    setCertType("Barangay Clearance");
    setPurpose("");
    setFields({});
    setFee("");
    setExempt(false);
    setExemptReason("");
  };

  const closeCreate = () => {
    setCreateOpen(false);
    resetCreateForm();
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
      const type = toCertType(
        request.service_type,
        (catalogue?.types ?? []).map((t) => t.name),
      );

      setCertType(type);
      setFields({});
      if (request.purpose) setPurpose(request.purpose);
      setFee(String(feeFor(type, request.purpose ?? "", {})));
    }
  };

  const openDetailEdit = (certificate: Certificate) => {
    setDetailType(certificate.certificate_type);
    setDetailPurpose(certificate.purpose ?? "");
    setEditingDetail(true);
  };

  const saveDetailEdit = async () => {
    if (!detail) return;
    if (
      !(await confirmAction({
        title: "Save these corrections?",
        text: "The certificate type and purpose will be updated.",
        confirmText: "Yes, save",
      }))
    )
      return;
    try {
      const response = await api.put(`/certificates/${detail.id}`, {
        certificate_type: detailType,
        purpose: detailPurpose,
      });
      setDetail(response.data.data);
      setEditingDetail(false);
      toast(response.data.message);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const changeType = (type: string) => {
    setCertType(type);
    /* Answers belong to the form that asked them; keeping them across a
       type change carried a date of death onto a residency certificate. */
    setFields({});
    if (!exempt) setFee(String(feeFor(type, purpose, {})));
  };

  /*
   * The purpose moves the price, not only the type. A clearance for a
   * Mayor's Permit is ₱200 and one for local employment is ₱30, so the
   * amount has to follow the dropdown as it changes.
   */
  const changePurpose = (value: string) => {
    setPurpose(value);
    if (!exempt) setFee(String(feeFor(certType, value, fields)));
  };

  const changeField = (key: string, value: string) => {
    const next = { ...fields, [key]: value };

    setFields(next);
    if (!exempt) setFee(String(feeFor(certType, purpose, next)));
  };

  const spec = catalogue?.types.find((t) => t.name === certType);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!certResident) return;
    if (!(await confirmAction({ title: "File this certificate?", confirmText: "Yes, file" }))) return;
    setSaving(true);
    try {
      await api.post("/certificates", {
        resident_id: certResident.id,
        service_request_id: selectedRequestId ? Number(selectedRequestId) : undefined,
        certificate_type: certType,
        purpose,
        template_fields: fields,
        fee_amount: exempt ? 0 : Number(fee),
        is_exempt: exempt,
        exemption_reason: exempt ? exemptReason : undefined,
      });
      setCreateOpen(false);
      toast("Certificate filed — it is now being processed. Print it when you are ready.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Every step of the workflow goes through here. Each one is a plain "this
   * happened" confirmation — none of them is a decision about whether the
   * resident may have their certificate.
   */
  type Action = "accept" | "release" | "reprint";

  const PROMPTS: Record<Action, { title: string; text?: string; confirmText: string }> = {
    accept: {
      title: "Start this request?",
      text: "The resident will be told a clerk is preparing their certificate.",
      confirmText: "Yes, start it",
    },
    release: {
      title: "Release this certificate to the resident?",
      text: "Confirm only once they have it in hand.",
      confirmText: "Yes, released",
    },
    reprint: { title: "Log a reprint for this certificate?", confirmText: "Yes, log reprint" },
  };

  const act = async (certificate: Certificate, action: Action) => {
    if (!(await confirmAction(PROMPTS[action]))) return;
    try {
      const response = await api.post(`/certificates/${certificate.id}/${action}`);
      toast(response.data.message);
      setDetail(null);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  /**
   * Print, and that is the whole middle of the workflow.
   *
   * No confirmation dialog: the printout opens in its own window where the
   * clerk can see it perfectly well, and asking "did it print?" made them
   * answer for something already in front of them. If it comes out badly they
   * press Print again — the record has moved on either way, because the
   * document now exists.
   */
  /*
   * The counter photograph, for the clearance that carries one.
   *
   * Only the picture: the two thumbmark boxes print empty because a
   * thumbmark is inked onto the paper in front of the clerk. Offering to
   * upload one would be offering to witness something from a distance.
   */
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoUpload = useUpload();

  const attachPhoto = async (certificate: Certificate, file: File) => {
    setPhotoFile(file);

    try {
      const form = new FormData();

      form.append("photo", file);

      const response = await api.post(
        `/certificates/${certificate.id}/photo`,
        form,
        /* So the bar reports the transfer rather than guessing at it. */
        { ...photoUpload.tracker },
      );

      photoUpload.finish();
      setDetail(response.data.data);
      toast(response.data.message);
      load(true);
    } catch (err) {
      photoUpload.fail();
      setPhotoFile(null);
      toast(errorMessage(err), "error");
    }
  };

  const printAndFinish = async (certificate: Certificate) => {
    openPrintView(certificate, council, catalogue);
    try {
      const response = await api.post(`/certificates/${certificate.id}/mark-printed`);
      toast(response.data.message);
      setDetail(null);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const openDetail = async (certificate: Certificate) => {
    setDetail(certificate); // show list data immediately
    setEditingDetail(false);
    try {
      const response = await api.get(`/certificates/${certificate.id}`);
      setDetail(response.data.data);
    } catch {
      // keep the list-row data if the detail fetch fails
    }
  };

  /** The buttons that make sense for a certificate at its current stage. */
  const actionsFor = (c: Certificate, size: "sm" | "lg") => {
    const base =
      size === "sm"
        ? "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold"
        : "cursor-pointer rounded-full px-6 py-2.5 text-sm font-semibold";
    const primary = `${base} bg-primary text-white hover:bg-primary-dark`;
    const outline = `${base} border border-primary/40 text-primary hover:bg-primary hover:text-white`;
    const success = `${base} bg-success text-white hover:opacity-90`;
    const quiet = `${base} border border-gray text-gray-500 hover:border-primary hover:text-primary`;

    return (
      <>
        {c.status === "Pending" && (
          <button type="button" onClick={() => act(c, "accept")} className={primary}>
            Accept &amp; start
          </button>
        )}
        {c.status === "Processing" && (
          <button type="button" onClick={() => printAndFinish(c)} className={primary}>
            Print
          </button>
        )}
        {c.status === "Ready to Claim" && (
          <>
            <button type="button" onClick={() => openPrintView(c, council, catalogue)} className={quiet}>
              Print again
            </button>
            <button type="button" onClick={() => act(c, "release")} className={success}>
              Release to resident
            </button>
          </>
        )}
        {c.status === "Released" && (
          <>
            <button type="button" onClick={() => openPrintView(c, council, catalogue)} className={outline}>
              Print
            </button>
            <button
              type="button"
              onClick={() => act(c, "reprint")}
              className={quiet}
              title={`Reprints: ${c.reprint_count}`}
            >
              Log reprint
            </button>
          </>
        )}
        {/*
          No cancel. The office decided a filed request is not withdrawn —
          it is worked, or it waits. A certificate already Cancelled keeps
          that status and stays findable; what has gone is the ability to
          put a new one there.
        */}
      </>
    );
  };

  return (
    <div>
      <PageHeader
        title="Certificates & Clearances"
        subtitle="Accept → print → release, with public QR/reference verification"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> New certificate
          </button>
        }
      />

      {/* How the workflow moves */}
      <div className="mb-4 rounded-2xl border border-gray bg-white px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-dark">Workflow:</span>
          {FLOW.map((stage, index) => (
            <span key={stage} className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  stage === "Ready to Claim" || stage === "Released"
                    ? "bg-success/10 text-success"
                    : stage === "Pending"
                      ? "bg-warning/10 text-warning"
                      : "bg-primary/10 text-primary"
                }`}
              >
                {index + 1}. {stage}
              </span>
              {index < FLOW.length - 1 && <span className="text-gray-400">→</span>}
            </span>
          ))}
        </div>
        <p className="mt-2 text-gray-500">
          Three presses, all the clerk's: <strong>accept</strong>, <strong>print</strong>,
          <strong> release</strong>. There is no approval step and no signature to click — the
          Punong Barangay signs the paper on its way to the counter. The resident is notified
          automatically when it is <strong>ready to claim</strong> and again when they have
          <strong> received</strong> it.
        </p>
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
              {status && counts[status] ? (
                <span className="ml-1.5 opacity-70">{counts[status]}</span>
              ) : null}
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
              /*
                The name, and how to reach them.

                A certificate sits Ready to Claim until somebody collects it,
                and the resident only learns it is ready if they open their
                portal. Plenty never do. The purok and the number are already
                on the register — showing them here is the difference between
                a clerk who can send a text and one who waits.

                Read from the register rather than copied onto the
                certificate, so a resident who moves is reachable at the
                address they moved to.
              */
              render: (c: Certificate) => (
                <div className="min-w-0">
                  <p className="font-medium text-dark">
                    {c.resident ? personName(c.resident) : "—"}
                  </p>
                  {(c.resident?.zone_purok || c.resident?.contact_number) && (
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {[c.resident.zone_purok, c.resident.contact_number]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ),
            },
            { header: "Type", render: (c: Certificate) => c.certificate_type },
            {
              /*
                How it was asked for, on the list rather than a modal away.

                It decides what the clerk does with a finished certificate:
                somebody who walked in is expecting a call, and somebody who
                asked online may never open their portal to learn it is
                ready. Buried in the detail, that had to be checked one row
                at a time.
              */
              header: "Channel",
              render: (c: Certificate) =>
                c.service_request?.request_type ? (
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      c.service_request.request_type === "Online"
                        ? "bg-primary/10 text-primary"
                        : "bg-secondary text-gray-600"
                    }`}
                  >
                    {c.service_request.request_type}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                ),
            },
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
                <RowActions>
                  <RowAction label="View certificate" icon={FiEye} onClick={() => openDetail(c)} />
                  {actionsFor(c, "sm")}
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by name, certificate #, or reference…"
          /*
            The purok and the number are searchable too, so a clerk ringing
            round the ones ready to claim can pull up a whole purok at once
            rather than opening them one at a time.
          */
          getSearchText={(c) =>
            [
              c.certificate_number,
              c.reference_number,
              c.resident ? personName(c.resident) : "",
              c.certificate_type,
              c.resident?.zone_purok ?? "",
              c.resident?.contact_number ?? "",
              c.service_request?.request_type ?? "",
            ].join(" ")
          }
          filters={[{ label: "Type", getValue: (c) => c.certificate_type }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={closeCreate} title="New Certificate" size="xl">
        <form onSubmit={create} className="space-y-4">
          <FormField label="Resident" required  plain>
            {/* Constituents only: a barangay certificate says something
                about somebody who lives here, and the server refuses
                a non-resident anyway. */}
            <ResidentPicker value={certResident} onChange={pickResident} residentsOnly />
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
                {(catalogue?.types ?? []).map((type) => (
                  <option key={type.name}>{type.name}</option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Fee (₱)"
              hint={
                spec?.fee === null
                  ? "Set by the ordinance from the answer below, not by the type"
                  : "Set by the ordinance of 18 January 2020"
              }
            >
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

          {/*
            A list where the ordinance prices by purpose, a free line where it
            does not. Typed freely, "Mayors permit" is not "Mayor's Permit" and
            the resident was charged ₱30 for a ₱200 document.
          */}
          <FormField label="Purpose" required>
            {spec?.fee_from === "clearance" ? (
              <select
                value={purpose}
                onChange={(e) => changePurpose(e.target.value)}
                required
                className={inputClasses}
              >
                <option value="">Choose what the clearance is for…</option>
                {Object.entries(catalogue?.clearance_purposes ?? {}).map(([name, amount]) => (
                  <option key={name} value={name}>
                    {name} — ₱{amount}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={purpose}
                onChange={(e) => changePurpose(e.target.value)}
                required
                className={inputClasses}
                placeholder="e.g. Employment requirement"
              />
            )}
          </FormField>

          {/*
            What this particular form asks for and the register cannot answer
            — the hour of a death, a partner's name, the work applied for.
            Nothing shows for a certificate that asks nothing.
          */}
          {(spec?.fields ?? []).length > 0 && (
            <div className="rounded-2xl border border-gray bg-secondary/40 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                What this form asks for
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(spec?.fields ?? []).map((key) => (
                  <FormField
                    key={key}
                    label={FIELD_LABELS[key] ?? key}
                    hint={FIELD_HINTS[key]}
                  >
                    {key === "business_kind" ? (
                      <select
                        value={fields[key] ?? ""}
                        onChange={(e) => changeField(key, e.target.value)}
                        className={inputClasses}
                      >
                        <option value="">Choose the kind of business…</option>
                        {Object.entries(catalogue?.business_kinds ?? {}).map(([name, amount]) => (
                          <option key={name} value={name}>
                            {name} — ₱{amount}
                          </option>
                        ))}
                      </select>
                    ) : key === "date_of_death" ? (
                      <input
                        type="date"
                        value={fields[key] ?? ""}
                        onChange={(e) => changeField(key, e.target.value)}
                        className={inputClasses}
                      />
                    ) : key === "body" ? (
                      <textarea
                        rows={3}
                        value={fields[key] ?? ""}
                        onChange={(e) => changeField(key, e.target.value)}
                        className={inputClasses}
                      />
                    ) : (
                      <input
                        value={fields[key] ?? ""}
                        onChange={(e) => changeField(key, e.target.value)}
                        className={inputClasses}
                      />
                    )}
                  </FormField>
                ))}
              </div>

              {spec?.needs_photo && (
                <p className="mt-3 text-xs leading-relaxed text-gray-500">
                  This clearance prints a photo box and two thumbmark boxes. Attach the
                  photograph on the certificate&rsquo;s own page; the thumbmarks are inked onto
                  the printed sheet at the counter.
                </p>
              )}
            </div>
          )}

          <FormField label="Fee exemption">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
              <input
                type="checkbox"
                checked={exempt}
                onChange={(e) => {
                  setExempt(e.target.checked);
                  if (e.target.checked) setFee("0");
                  else setFee(String(feeFor(certType, purpose, fields)));
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
            {saving ? "Filing…" : "File certificate"}
          </button>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => { setDetail(null); setEditingDetail(false); }} title="Certificate Details" wide>
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

            {/* Where the document has got to */}
            {detail.status !== "Cancelled" && (
              <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-secondary p-3 text-xs">
                {FLOW.map((stage, index) => {
                  const current = FLOW.indexOf(detail.status);
                  const done = current >= 0 && index <= current;
                  return (
                    <div key={stage} className="flex items-center">
                      <span className={`rounded-full px-3 py-1 font-semibold ${done ? "bg-primary text-white" : "bg-white text-gray-400"}`}>
                        {index + 1}. {stage}
                      </span>
                      {index < FLOW.length - 1 && <span className="mx-1 text-gray-300">→</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Type and purpose stay correctable until the document is
                printed — after that the paper and the record must agree. */}
            {editingDetail ? (
              <div className="grid gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-2">
                <FormField label="Certificate type" required>
                  <select
                    value={detailType}
                    onChange={(e) => setDetailType(e.target.value)}
                    className={inputClasses}
                  >
                    {(catalogue?.types ?? []).map((t) => (
                      <option key={t.name}>{t.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Purpose" required>
                  <input
                    value={detailPurpose}
                    onChange={(e) => setDetailPurpose(e.target.value)}
                    className={inputClasses}
                  />
                </FormField>
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    type="button"
                    onClick={saveDetailEdit}
                    disabled={!detailPurpose.trim()}
                    className="flex-1 cursor-pointer rounded-full bg-primary py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    Save corrections
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingDetail(false)}
                    className="flex-1 cursor-pointer rounded-full border border-gray py-2 text-xs font-semibold text-dark hover:border-primary hover:text-primary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              ["Pending", "Processing"].includes(detail.status) && (
                <button
                  type="button"
                  onClick={() => openDetailEdit(detail)}
                  className="w-full cursor-pointer rounded-full border border-primary/40 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                >
                  Correct type or purpose
                </button>
              )
            )}

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Resident", detail.resident ? personName(detail.resident) : "—"],
                /*
                  How to tell them it is ready. Read live from the register:
                  a number copied onto the certificate at filing time is the
                  number they had then, not the one they have now.
                */
                ["Purok", detail.resident?.zone_purok || "Not recorded"],
                ["Contact", detail.resident?.contact_number || "No number on file"],
                ["Purpose", detail.purpose ?? "—"],
                ["Fee", detail.is_exempt ? `Exempt${detail.exemption_reason ? ` — ${detail.exemption_reason}` : ""}` : `₱${Number(detail.fee_amount).toFixed(2)}`],
                ["Requested", detail.created_at ? new Date(detail.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—"],
                ["Started by", detail.processor?.name ? `${detail.processor.name}${detail.processed_at ? ` · ${new Date(detail.processed_at).toLocaleDateString("en-PH")}` : ""}` : "Not started yet"],
                ["Printed", detail.printed_at ? new Date(detail.printed_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not yet printed"],
                ["Released", detail.released_at ? new Date(detail.released_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not yet released"],
                ["Reprints", String(detail.reprint_count ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray/70 px-3.5 py-2.5">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-dark">{value}</dd>
                </div>
              ))}
            </dl>

            {catalogue?.types.find((t) => t.name === detail.certificate_type)?.needs_photo && (
              <div className="rounded-xl border border-gray/70 px-4 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Counter photograph
                </p>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-[120px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray bg-secondary">
                    {detail.photo_url ? (
                      <img src={detail.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-2 text-center text-[11px] leading-tight text-gray-400">
                        No photo yet
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {detail.printed_at ? (
                      <p className="text-xs leading-relaxed text-gray-500">
                        Already printed, so the photograph is locked — the paper the resident
                        holds and this record have to agree.
                      </p>
                    ) : (
                      <>
                        {/* The shared field, so this upload names the file it
                            took and reports how far it has got — like every
                            other upload in the system. */}
                        <FileField
                          file={photoFile}
                          onPick={(file) => {
                            setPhotoFile(file);
                            if (file) void attachPhoto(detail, file);
                          }}
                          progress={photoUpload.progress}
                          done={photoUpload.done}
                        />
                        <p className="mt-2 text-xs leading-relaxed text-gray-500">
                          It prints in the box beside the thumbmarks. The thumbmarks themselves
                          are inked onto the printed sheet here at the counter.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(detail.requirements_checklist?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-gray/70 px-4 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Documentary requirements presented
                </p>
                <ul className="space-y-1.5 text-sm">
                  {detail.requirements_checklist?.map((entry) => (
                    <li key={entry.item} className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                          entry.presented ? "bg-success" : "bg-danger"
                        }`}
                        aria-hidden="true"
                      >
                        {entry.presented ? "✓" : "✕"}
                      </span>
                      <span className={entry.presented ? "text-dark" : "text-danger"}>
                        {entry.item}
                        {!entry.presented && " — not presented"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {STAGE_HELP[detail.status] && (
              <p
                className={`rounded-xl px-4 py-3 text-sm text-dark ${
                  detail.status === "Ready to Claim" || detail.status === "Released"
                    ? "bg-success/10"
                    : detail.status === "Pending"
                      ? "bg-warning/10"
                      : "bg-primary/10"
                }`}
              >
                {STAGE_HELP[detail.status]}
              </p>
            )}

            {detail.status === "Cancelled" && (
              <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-dark">
                This request was cancelled
                {detail.cancel_reason ? <> — reason: <strong>{detail.cancel_reason}</strong></> : "."}{" "}
                The resident was notified.
              </p>
            )}

            <div className="flex flex-wrap gap-2">{actionsFor(detail, "lg")}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
