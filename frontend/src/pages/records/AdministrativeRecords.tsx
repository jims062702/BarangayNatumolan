import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import { FiArchive, FiCheck, FiEdit2, FiRotateCcw, FiTrash2, FiPlus } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { AdministrativeRecord } from "../../types";

/** Mirrors the document_type enum on administrative_records. */
const DOCUMENT_TYPES = [
  "Ordinance",
  "Resolution",
  "Executive Order",
  "Memorandum",
  "Meeting Minutes",
  "Committee Report",
  "Correspondence",
  "Contract",
  "Agreement",
  "Barangay Assembly Record",
  "Other",
];

const today = () => new Date().toISOString().slice(0, 10);
const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

interface DraftForm {
  document_type: string;
  document_number: string;
  document_title: string;
  document_date: string;
  document_content: string;
  summary: string;
  file_reference: string;
}

const emptyDraft = (): DraftForm => ({
  document_type: DOCUMENT_TYPES[0],
  document_number: "",
  document_title: "",
  document_date: today(),
  document_content: "",
  summary: "",
  file_reference: "",
});

export default function AdministrativeRecords() {
  const { user } = useAuth();
  const isPunongBarangay = user?.role === "Punong Barangay" || user?.role === "Admin";

  const [rows, setRows] = useState<AdministrativeRecord[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdministrativeRecord | null>(null);
  const [draft, setDraft] = useState<DraftForm>(emptyDraft());

  const [viewing, setViewing] = useState<AdministrativeRecord | null>(null);

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
      .get("/administrative-records", { params: { page, archived: showArchived ? 1 : 0 } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, showArchived]);

  useAutoRefresh(() => load(true), REFRESH.staff);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setDraft(emptyDraft());
  };

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setFormOpen(true);
  };

  const openEdit = (record: AdministrativeRecord) => {
    setEditing(record);
    setDraft({
      document_type: record.document_type,
      document_number: record.document_number,
      document_title: record.document_title,
      document_date: record.document_date.slice(0, 10),
      document_content: record.document_content,
      summary: record.summary ?? "",
      file_reference: record.file_reference ?? "",
    });
    setFormOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !(await confirmAction({
        title: editing ? "Save changes to this document?" : "File this document?",
        confirmText: "Yes, save",
      }))
    )
      return;
    const payload = {
      ...draft,
      summary: draft.summary || null,
      file_reference: draft.file_reference || null,
    };
    try {
      if (editing) {
        await api.put(`/administrative-records/${editing.id}`, payload);
        toast(`${draft.document_number} updated.`);
      } else {
        await api.post("/administrative-records", payload);
        toast(`${draft.document_number} filed.`);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const approve = async (record: AdministrativeRecord) => {
    if (
      !(await confirmAction({
        title: `Approve ${record.document_number}?`,
        text: "Once approved, the document can no longer be edited.",
        confirmText: "Yes, approve",
      }))
    )
      return;
    try {
      await api.post(`/administrative-records/${record.id}/approve`);
      toast(`${record.document_number} approved.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const toggleArchive = async (record: AdministrativeRecord) => {
    const archiving = !record.is_archived;
    if (
      !(await confirmAction({
        title: archiving ? `Archive ${record.document_number}?` : `Restore ${record.document_number}?`,
        confirmText: archiving ? "Yes, archive" : "Yes, restore",
      }))
    )
      return;
    try {
      await api.post(`/administrative-records/${record.id}/archive`, { is_archived: archiving });
      toast(archiving ? "Document archived." : "Document restored.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const remove = async (record: AdministrativeRecord) => {
    if (
      !(await confirmAction({
        title: `Delete ${record.document_number}?`,
        text: "Only unapproved drafts can be deleted. Approved documents are archived instead.",
        confirmText: "Yes, delete",
        danger: true,
      }))
    )
      return;
    try {
      await api.delete(`/administrative-records/${record.id}`);
      toast(`${record.document_number} deleted.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <PageHeader
        title="Barangay Administrative Records"
        subtitle="Ordinances, resolutions, executive orders, minutes and official documents"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> File document
          </button>
        }
      />

      <Card>
        <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-dark">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setPage(1);
              setShowArchived(e.target.checked);
            }}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
          Show the archive instead of current documents
        </label>

        <DataTable
          columns={[
            { header: "Number", render: (r: AdministrativeRecord) => r.document_number },
            { header: "Type", render: (r: AdministrativeRecord) => r.document_type },
            {
              header: "Title",
              render: (r: AdministrativeRecord) => (
                <button
                  type="button"
                  onClick={() => setViewing(r)}
                  className="cursor-pointer text-left font-medium text-primary hover:underline"
                >
                  {r.document_title}
                </button>
              ),
            },
            { header: "Date", render: (r: AdministrativeRecord) => asDate(r.document_date) },
            {
              header: "Status",
              render: (r: AdministrativeRecord) =>
                r.approved_at ? (
                  <span className="inline-block whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                    Approved
                  </span>
                ) : (
                  <span className="inline-block whitespace-nowrap rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                    For approval
                  </span>
                ),
            },
            {
              header: "Actions",
              render: (r: AdministrativeRecord) => (
                <RowActions>
                  {!r.approved_at && (
                    <RowAction label="Edit record" icon={FiEdit2} onClick={() => openEdit(r)} />
                  )}
                  {!r.approved_at && isPunongBarangay && (
                    <RowAction
                      label="Approve record"
                      icon={FiCheck}
                      tone="primary"
                      onClick={() => approve(r)}
                    />
                  )}
                  {/* Adopted documents are archived, never deleted. */}
                  {!r.approved_at && (
                    <RowAction
                      label="Delete record"
                      icon={FiTrash2}
                      tone="danger"
                      onClick={() => remove(r)}
                    />
                  )}
                  <RowAction
                    label={r.is_archived ? "Restore record" : "Archive record"}
                    icon={r.is_archived ? FiRotateCcw : FiArchive}
                    onClick={() => toggleArchive(r)}
                  />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by number, title or summary…"
          getSearchText={(r) =>
            `${r.document_number} ${r.document_title} ${r.document_type} ${r.summary ?? ""}`
          }
          filters={[{ label: "Type", getValue: (r) => r.document_type, options: DOCUMENT_TYPES }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage={showArchived ? "The archive is empty." : "No documents filed yet."}
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={closeForm}
        size="xl"
        title={editing ? `Edit ${editing.document_number}` : "File Administrative Document"}
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Document type" required>
              <select
                value={draft.document_type}
                onChange={(e) => set("document_type", e.target.value)}
                className={inputClasses}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Document number" required hint="e.g. Ordinance No. 2026-05">
              <input
                name="document_number"
                value={draft.document_number}
                onChange={(e) => set("document_number", e.target.value)}
                required
                className={inputClasses}
              />
            </FormField>
          </div>
          <FormField label="Title" required>
            <input
              value={draft.document_title}
              onChange={(e) => set("document_title", e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Document date" required>
              <input
                type="date"
                value={draft.document_date}
                onChange={(e) => set("document_date", e.target.value)}
                required
                className={inputClasses}
              />
            </FormField>
            <FormField label="File reference">
              <input
                value={draft.file_reference}
                onChange={(e) => set("file_reference", e.target.value)}
                className={inputClasses}
              />
            </FormField>
          </div>
          <FormField label="Summary">
            <textarea
              value={draft.summary}
              onChange={(e) => set("summary", e.target.value)}
              rows={2}
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <FormField label="Full text" required>
            <textarea
              value={draft.document_content}
              onChange={(e) => set("document_content", e.target.value)}
              required
              rows={3}
              className={inputClasses}
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            {editing ? "Save changes" : "File document"}
          </button>
        </form>
      </Modal>

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        wide
        title={viewing?.document_number ?? "Document"}
      >
        {viewing && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-dark">{viewing.document_title}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {viewing.document_type} · {asDate(viewing.document_date)}
                {viewing.file_reference && ` · File ${viewing.file_reference}`}
              </p>
            </div>
            <dl className="grid gap-3 rounded-xl bg-secondary px-4 py-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Filed by</dt>
                <dd className="text-dark">{viewing.creator?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Approved</dt>
                <dd className="text-dark">
                  {viewing.approved_at
                    ? `${viewing.approver?.name ?? "—"} · ${asDate(viewing.approved_at)}`
                    : "Awaiting the Punong Barangay"}
                </dd>
              </div>
            </dl>
            {viewing.summary && (
              <p className="rounded-xl border border-gray px-4 py-3 text-sm text-gray-500">
                {viewing.summary}
              </p>
            )}
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray px-4 py-3 text-sm leading-relaxed text-dark">
              {viewing.document_content}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
