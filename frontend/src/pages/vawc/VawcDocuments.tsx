import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { FiEdit2, FiEye } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { VawcAccessLog, VawcDocument } from "../../types";

/** Mirrors the document_type enum on vawc_documents. */
const DOCUMENT_TYPES = [
  "Affidavit",
  "Statement",
  "Medical Certificate",
  "Police Report",
  "Photograph",
  "Protection Order",
  "Other",
];

/** Access-trail actions, labelled for the audit table. */
const ACTION_LABELS: Record<string, string> = {
  created: "Case created",
  viewed: "Case viewed",
  updated: "Case updated",
  document_updated: "Document record edited",
  incident_added: "Incident added",
  referral_added: "Referral created",
  referral_updated: "Referral updated",
  followup_recorded: "Follow-up recorded",
  documents_viewed: "Documents viewed",
  document_added: "Document added",
};

const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

const asDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : "—";

type Tab = "documents" | "trail";

export default function VawcDocuments() {
  const [tab, setTab] = useState<Tab>("documents");

  const [documents, setDocuments] = useState<VawcDocument[]>([]);
  const [docPage, setDocPage] = useState(1);
  const [docLastPage, setDocLastPage] = useState(1);
  const [docLoading, setDocLoading] = useState(true);
  const [viewing, setViewing] = useState<VawcDocument | null>(null);

  // Metadata correction only — the register never swaps the underlying item.
  const [editing, setEditing] = useState<VawcDocument | null>(null);
  const [editForm, setEditForm] = useState({
    document_type: DOCUMENT_TYPES[0],
    title: "",
    description: "",
    file_reference: "",
  });

  const [logs, setLogs] = useState<VawcAccessLog[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logLastPage, setLogLastPage] = useState(1);
  const [logLoading, setLogLoading] = useState(true);

  const loadDocuments = () => {
    setDocLoading(true);
    api
      .get("/vawc/documents", { params: { page: docPage } })
      .then((r) => {
        setDocuments(r.data.data.data ?? []);
        setDocLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setDocLoading(false));
  };

  const loadLogs = () => {
    setLogLoading(true);
    api
      .get("/vawc/access-logs", { params: { page: logPage } })
      .then((r) => {
        setLogs(r.data.data.data ?? []);
        setLogLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLogLoading(false));
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPage]);

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logPage]);

  useAutoRefresh(() => (tab === "documents" ? loadDocuments() : loadLogs()), REFRESH.staff);

  const openEdit = (d: VawcDocument) => {
    setEditing(d);
    setEditForm({
      document_type: d.document_type,
      title: d.title,
      description: d.description ?? "",
      file_reference: d.file_reference ?? "",
    });
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    if (!(await confirmAction({ title: "Save changes to this document record?", confirmText: "Yes, save" })))
      return;
    try {
      await api.put(`/vawc/documents/${editing.id}`, {
        ...editForm,
        description: editForm.description || null,
        file_reference: editForm.file_reference || null,
      });
      setEditing(null);
      toast("Document record updated — the change is in the access trail.");
      loadDocuments();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const caseLink = (row: { vawc_case?: { id: number; case_code: string } | null }) =>
    row.vawc_case ? (
      <Link
        to={`/vawc/cases/${row.vawc_case.id}`}
        className="font-mono font-semibold text-primary hover:underline"
      >
        {row.vawc_case.case_code}
      </Link>
    ) : (
      "—"
    );

  return (
    <div>
      <PageHeader
        title="Incident & Confidential Documents"
        subtitle="Document register across every case, and the complete access trail"
      />

      <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-dark">
        <strong>Controlled access:</strong> printing or downloading any item
        here must be for an authorised purpose. Every case opened from this
        page is written to the access trail below, with your name and the time.
      </div>

      <div className="mb-4 rounded-2xl border border-gray bg-secondary px-4 py-3 text-xs text-gray-500">
        This is a <strong className="text-dark">register, not a file store</strong>.
        It records that a document exists, who holds it and where — the{" "}
        <strong className="text-dark">file reference</strong> is what you type
        to locate the physical or scanned copy (folder, cabinet, or case-file
        number). The document itself is not uploaded here.
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            ["documents", "Document register"],
            ["trail", "Access trail"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "bg-primary text-white"
                : "border border-gray bg-white text-dark hover:border-primary hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "documents" ? (
        <Card>
          <DataTable
            columns={[
              { header: "Case Code", render: caseLink },
              { header: "Type", render: (d: VawcDocument) => d.document_type },
              {
                header: "Title",
                render: (d: VawcDocument) => (
                  <button
                    type="button"
                    onClick={() => setViewing(d)}
                    className="cursor-pointer text-left font-medium text-primary hover:underline"
                  >
                    {d.title}
                  </button>
                ),
              },
              { header: "File reference", render: (d: VawcDocument) => d.file_reference ?? "—" },
              { header: "Recorded by", render: (d: VawcDocument) => d.uploader?.name ?? "—" },
              { header: "Date", render: (d: VawcDocument) => asDate(d.created_at) },
              {
                header: "Actions",
                render: (d: VawcDocument) => (
                  <RowActions>
                    <RowAction
                      label="View document"
                      icon={FiEye}
                      tone="primary"
                      onClick={() => setViewing(d)}
                    />
                    <RowAction label="Edit document" icon={FiEdit2} onClick={() => openEdit(d)} />
                  </RowActions>
                ),
              },
            ]}
            rows={documents}
            rowKey={(d) => d.id}
            numbered
            total={documents.length}
            searchable
            searchPlaceholder="Search by case code, title or type…"
            getSearchText={(d) =>
              `${d.vawc_case?.case_code ?? ""} ${d.title} ${d.document_type} ${d.file_reference ?? ""}`
            }
            filters={[
              { label: "Type", getValue: (d) => d.document_type, options: DOCUMENT_TYPES },
            ]}
            loading={docLoading}
            page={docPage}
            lastPage={docLastPage}
            onPageChange={setDocPage}
            emptyMessage="No confidential documents recorded yet."
          />
        </Card>
      ) : (
        <Card>
          <DataTable
            columns={[
              { header: "When", render: (l: VawcAccessLog) => asDateTime(l.created_at) },
              { header: "Case Code", render: caseLink },
              {
                header: "Action",
                render: (l: VawcAccessLog) => ACTION_LABELS[l.action] ?? l.action,
              },
              { header: "Detail", render: (l: VawcAccessLog) => l.detail ?? "—" },
              { header: "Officer", render: (l: VawcAccessLog) => l.user?.name ?? "—" },
            ]}
            rows={logs}
            rowKey={(l) => l.id}
            numbered
            searchable
            searchPlaceholder="Search the trail by case code, action or officer…"
            getSearchText={(l) =>
              `${l.vawc_case?.case_code ?? ""} ${ACTION_LABELS[l.action] ?? l.action} ${l.detail ?? ""} ${l.user?.name ?? ""}`
            }
            filters={[
              { label: "Action", getValue: (l) => ACTION_LABELS[l.action] ?? l.action },
              { label: "Officer", getValue: (l) => l.user?.name ?? "—" },
            ]}
            loading={logLoading}
            page={logPage}
            lastPage={logLastPage}
            onPageChange={setLogPage}
            emptyMessage="No access recorded yet."
          />
        </Card>
      )}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? "Document"}
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 rounded-xl bg-secondary px-4 py-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Case</dt>
                <dd className="font-mono text-dark">{viewing.vawc_case?.case_code ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Type</dt>
                <dd className="text-dark">{viewing.document_type}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">File reference</dt>
                <dd className="text-dark">{viewing.file_reference ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Recorded by</dt>
                <dd className="text-dark">
                  {viewing.uploader?.name ?? "—"} · {asDate(viewing.created_at)}
                </dd>
              </div>
            </dl>
            {viewing.description && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">Description</p>
                <p className="whitespace-pre-wrap rounded-xl border border-gray px-4 py-3 text-dark">
                  {viewing.description}
                </p>
              </div>
            )}
            <p className="rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
              The physical or scanned item is held under its file reference.
              This register records its existence and custody, not the file itself.
            </p>
          </div>
        )}
      </Modal>

      {/* Correct the particulars of a recorded document. */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit record — ${editing?.vawc_case?.case_code ?? ""}`}
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <FormField label="Document type" required>
            <select
              value={editForm.document_type}
              onChange={(e) => setEditForm((p) => ({ ...p, document_type: e.target.value }))}
              className={inputClasses}
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Title" required>
            <input
              value={editForm.title}
              onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
              required
              className={inputClasses}
            />
          </FormField>
          <FormField
            label="File reference"
            hint="Where the actual copy is kept — folder, cabinet, or case-file number. The system stores this pointer, not the document."
          >
            <input
              value={editForm.file_reference}
              onChange={(e) => setEditForm((p) => ({ ...p, file_reference: e.target.value }))}
              className={inputClasses}
              placeholder="e.g. VAWC Cabinet 2, Folder 14"
            />
          </FormField>
          <FormField label="Description">
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Save changes
          </button>
        </form>
      </Modal>
    </div>
  );
}
