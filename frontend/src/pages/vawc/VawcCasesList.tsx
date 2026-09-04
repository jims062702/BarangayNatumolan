import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { formatWallClock } from "../../lib/datetime";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import PhoneInput from "../../components/UI/PhoneInput";
import ResidentPicker from "../../components/ResidentPicker";
import ResidentMultiPicker from "../../components/ResidentMultiPicker";
import type { Resident, VawcCase } from "../../types";

const VIOLENCE_TYPES = ["Physical", "Psychological", "Economic", "Sexual", "Mixed"];

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
const localNow = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

export default function VawcCasesList() {
  const [rows, setRows] = useState<VawcCase[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [survivor, setSurvivor] = useState<Resident | null>(null);
  const [violenceType, setViolenceType] = useState(VIOLENCE_TYPES[0]);
  const [relationship, setRelationship] = useState("");
  // Dependents are picked from the registry; the count follows the picks.
  const [dependents, setDependents] = useState<Resident[]>([]);
  // Off by default: most complaints come from the survivor herself, and the
  // reporting-party fields stay locked until the officer says otherwise.
  const [reportedByOther, setReportedByOther] = useState(false);
  const [reportedByName, setReportedByName] = useState("");
  const [reportedByRelationship, setReportedByRelationship] = useState("");
  const [reportedByContact, setReportedByContact] = useState("");
  const [immediateNeeds, setImmediateNeeds] = useState("");
  // Recorded, not assumed: an intake encoded the next morning must carry the
  // hour the complaint was actually made.
  const [reportedAt, setReportedAt] = useState(localNow);
  const [previousIncidents, setPreviousIncidents] = useState("0");
  const [narrative, setNarrative] = useState("");
  const [notes, setNotes] = useState("");

  // Correcting an intake: the API already allowed it, the registry did not.
  const [editing, setEditing] = useState<VawcCase | null>(null);
  const [editSurvivor, setEditSurvivor] = useState<Resident | null>(null);
  const [editReportedByOther, setEditReportedByOther] = useState(false);
  const [editDependents, setEditDependents] = useState<Resident[]>([]);
  const [editForm, setEditForm] = useState({
    violence_type: VIOLENCE_TYPES[0],
    relationship_to_offender: "",
    children_involved: false,
    children_count: "0",
    children_details: "",
    immediate_needs: "",
    previous_incidents_count: "0",
    confidential_notes: "",
    reported_by_name: "",
    reported_by_relationship: "",
    reported_by_contact: "",
  });

  const load = () => {
    setLoading(true);
    api
      .get("/vawc/cases", { params: { page } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  /** Clears the confidential intake draft — nothing may survive a cancel. */
  const resetIntake = () => {
    setSurvivor(null);
    setViolenceType(VIOLENCE_TYPES[0]);
    setRelationship("");
    setDependents([]);
    setReportedByOther(false);
    setReportedByName("");
    setReportedByRelationship("");
    setReportedByContact("");
    setImmediateNeeds("");
    setPreviousIncidents("0");
    setReportedAt(localNow());
    setNarrative("");
    setNotes("");
  };

  const closeIntake = () => {
    setIntakeOpen(false);
    resetIntake();
  };

  const intake = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "File this confidential case?", confirmText: "Yes, file case" }))) return;
    try {
      await api.post("/vawc/cases", {
        survivor_id: survivor?.id,
        violence_type: violenceType,
        relationship_to_offender: relationship || undefined,
        dependent_ids: dependents.map((d) => d.id),
        reported_by_name: reportedByOther ? reportedByName || undefined : undefined,
        reported_by_relationship: reportedByOther ? reportedByRelationship || undefined : undefined,
        reported_by_contact: reportedByOther ? reportedByContact || undefined : undefined,
        immediate_needs: immediateNeeds || undefined,
        previous_incidents_count: Number(previousIncidents) || 0,
        report_date: reportedAt ? reportedAt.replace("T", " ") + ":00" : undefined,
        incident_narrative: narrative || undefined,
        confidential_notes: notes || undefined,
      });
      setIntakeOpen(false);
      resetIntake();
      toast("Case recorded confidentially. A case code was assigned in place of the survivor's name.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  /**
   * Fetches the full case rather than reusing the list row: the registry
   * deliberately carries case codes only, and opening identifiable detail is
   * exactly the event the access trail exists to record.
   */
  const openEdit = async (row: VawcCase) => {
    let c = row;
    try {
      const response = await api.get(`/vawc/cases/${row.id}`);
      c = response.data.data;
    } catch {
      // Fall back to the list row — the form still works, minus the survivor.
    }
    setEditing(c);
    setEditSurvivor(c.survivor ?? null);
    setEditReportedByOther(Boolean(c.reported_by_name));
    setEditDependents(c.dependents ?? []);
    setEditForm({
      violence_type: c.violence_type,
      relationship_to_offender: c.relationship_to_offender ?? "",
      children_involved: c.children_involved,
      children_count: String(c.children_count ?? 0),
      children_details: c.children_details ?? "",
      immediate_needs: c.immediate_needs ?? "",
      previous_incidents_count: String(c.previous_incidents_count ?? 0),
      confidential_notes: c.confidential_notes ?? "",
      reported_by_name: c.reported_by_name ?? "",
      reported_by_relationship: c.reported_by_relationship ?? "",
      reported_by_contact: c.reported_by_contact ?? "",
    });
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    if (!(await confirmAction({ title: "Save changes to this case?", confirmText: "Yes, save" }))) return;
    try {
      await api.put(`/vawc/cases/${editing.id}`, {
        ...editForm,
        survivor_id: editSurvivor?.id,
        dependent_ids: editDependents.map((d) => d.id),
        previous_incidents_count: Number(editForm.previous_incidents_count) || 0,
        reported_by_name: editReportedByOther ? editForm.reported_by_name || null : null,
        reported_by_relationship: editReportedByOther ? editForm.reported_by_relationship || null : null,
        reported_by_contact: editReportedByOther ? editForm.reported_by_contact || null : null,
        relationship_to_offender: editForm.relationship_to_offender || null,
        immediate_needs: editForm.immediate_needs || null,
        confidential_notes: editForm.confidential_notes || null,
      });
      setEditing(null);
      toast(`${editing.case_code} updated — the change is in the access trail.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const setEdit = <K extends keyof typeof editForm>(key: K, value: (typeof editForm)[K]) =>
    setEditForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <PageHeader
        title="VAWC Confidential Case Registry"
        subtitle="Cases are identified by case code — access is logged"
        actions={
          <button
            type="button"
            onClick={() => setIntakeOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + Confidential intake
          </button>
        }
      />

      <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-dark">
        <strong>Reminder:</strong> VAWC cases are never mediated at the Lupon.
        Coordinate protective services immediately for high-risk situations.
      </div>

      <Card>
        <DataTable
          columns={[
            {
              header: "Case Code",
              render: (c: VawcCase) => (
                <Link to={`/vawc/cases/${c.id}`} className="font-mono font-semibold text-primary hover:underline">
                  {c.case_code}
                </Link>
              ),
            },
            { header: "Violence Type", render: (c: VawcCase) => c.violence_type },
            {
              header: "Reported",
              render: (c: VawcCase) => formatWallClock(c.report_date),
            },
            {
              header: "Children Involved",
              render: (c: VawcCase) => (c.children_involved ? `Yes (${c.children_count})` : "No"),
            },
            { header: "Officer", render: (c: VawcCase) => c.officer?.name ?? "—" },
            { header: "Status", render: (c: VawcCase) => <StatusBadge status={c.status} /> },
            {
              header: "Actions",
              render: (c: VawcCase) => (
                <div className="flex gap-1.5">
                  <Link
                    to={`/vawc/cases/${c.id}`}
                    className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    Edit
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          searchable
          searchPlaceholder="Search by case code…"
          getSearchText={(c) => `${c.case_code} ${c.violence_type} ${c.status}`}
          filters={[
            { label: "Status", getValue: (c) => c.status },
            { label: "Violence Type", getValue: (c) => c.violence_type },
          ]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No cases in the registry."
        />
      </Card>

      <Modal open={intakeOpen} onClose={closeIntake} title="Confidential Client Intake" size="xl">
        <form onSubmit={intake} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Survivor (resident record)" required plain>
              <ResidentPicker
                value={survivor}
                onChange={setSurvivor}
                excludeIds={dependents.map((d) => d.id)}
              />
            </FormField>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-medium text-dark">
              <input
                type="checkbox"
                checked={reportedByOther}
                onChange={(e) => setReportedByOther(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              Reported by someone other than the survivor
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Name">
                <input
                  value={reportedByName}
                  disabled={!reportedByOther}
                  onChange={(e) => setReportedByName(e.target.value)}
                  className={inputClasses}
                  placeholder="Neighbour, relative, official…"
                />
              </FormField>
              <FormField label="Relationship to survivor">
                <input
                  value={reportedByRelationship}
                  disabled={!reportedByOther}
                  onChange={(e) => setReportedByRelationship(e.target.value)}
                  className={inputClasses}
                />
              </FormField>
              <FormField label="Contact number">
                <PhoneInput
                  value={reportedByContact}
                  onChange={setReportedByContact}
                  disabled={!reportedByOther}
                />
              </FormField>
            </div>
          </div>

          <FormField label="Type of reported violence" required>
            <select value={violenceType} onChange={(e) => setViolenceType(e.target.value)} className={inputClasses}>
              {VIOLENCE_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Relationship to alleged offender">
            <input value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClasses} />
          </FormField>
          <FormField label="Date and time reported" required>
            <input
              type="datetime-local"
              value={reportedAt}
              max={localNow()}
              onChange={(e) => setReportedAt(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>

          <div>
            <FormField plain label="Children / dependents involved">
              <ResidentMultiPicker
                value={dependents}
                onChange={setDependents}
                excludeIds={survivor ? [survivor.id] : []}
              />
            </FormField>
          </div>
          <FormField label="Previous incidents">
            <input
              type="number"
              min="0"
              value={previousIncidents}
              onChange={(e) => setPreviousIncidents(e.target.value)}
              className={inputClasses}
            />
          </FormField>

          <div>
            <FormField label="Immediate needs">
              <input
                value={immediateNeeds}
                onChange={(e) => setImmediateNeeds(e.target.value)}
                className={inputClasses}
                placeholder="e.g. medical attention, temporary shelter, BPO"
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
            <FormField label="Incident narrative" hint="Stored encrypted">
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={2}
                className={`${inputClasses} resize-none`}
              />
            </FormField>
            <FormField label="Confidential interview notes" hint="Visible to VAWC personnel only">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={`${inputClasses} resize-none`}
              />
            </FormField>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={!survivor}
              className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              Record case confidentially
            </button>
          </div>
        </form>
      </Modal>

      {/* Correct an intake. The survivor link and report date are deliberately
          not editable here — re-pointing a case at a different person would
          rewrite history that the access trail cannot explain. */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="xl"
        title={`Edit intake — ${editing?.case_code ?? ""}`}
      >
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField
              plain
              label="Survivor (resident record)"
              required
              hint="Re-linking a case to a different person is recorded in the access trail."
            >
              <ResidentPicker
                value={editSurvivor}
                onChange={setEditSurvivor}
                excludeIds={editDependents.map((d) => d.id)}
              />
            </FormField>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-medium text-dark">
              <input
                type="checkbox"
                checked={editReportedByOther}
                onChange={(e) => setEditReportedByOther(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              Reported by someone other than the survivor
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Name">
                <input
                  value={editForm.reported_by_name}
                  disabled={!editReportedByOther}
                  onChange={(e) => setEdit("reported_by_name", e.target.value)}
                  className={inputClasses}
                />
              </FormField>
              <FormField label="Relationship to survivor">
                <input
                  value={editForm.reported_by_relationship}
                  disabled={!editReportedByOther}
                  onChange={(e) => setEdit("reported_by_relationship", e.target.value)}
                  className={inputClasses}
                />
              </FormField>
              <FormField label="Contact number">
                <PhoneInput
                  value={editForm.reported_by_contact}
                  onChange={(v) => setEdit("reported_by_contact", v)}
                  disabled={!editReportedByOther}
                />
              </FormField>
            </div>
          </div>

          <FormField label="Type of reported violence" required>
            <select
              value={editForm.violence_type}
              onChange={(e) => setEdit("violence_type", e.target.value)}
              className={inputClasses}
            >
              {VIOLENCE_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Relationship to alleged offender">
            <input
              value={editForm.relationship_to_offender}
              onChange={(e) => setEdit("relationship_to_offender", e.target.value)}
              className={inputClasses}
            />
          </FormField>
          <FormField label="Previous incidents">
            <input
              type="number"
              min="0"
              value={editForm.previous_incidents_count}
              onChange={(e) => setEdit("previous_incidents_count", e.target.value)}
              className={inputClasses}
            />
          </FormField>

          <div className="sm:col-span-2">
            <FormField plain label="Children / dependents involved">
              <ResidentMultiPicker
                value={editDependents}
                onChange={setEditDependents}
                excludeIds={editSurvivor ? [editSurvivor.id] : []}
              />
            </FormField>
          </div>
          <FormField label="Immediate needs">
            <input
              value={editForm.immediate_needs}
              onChange={(e) => setEdit("immediate_needs", e.target.value)}
              className={inputClasses}
            />
          </FormField>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Confidential interview notes" hint="Stored encrypted">
              <textarea
                value={editForm.confidential_notes}
                onChange={(e) => setEdit("confidential_notes", e.target.value)}
                rows={1}
                className={`${inputClasses} resize-y`}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Save changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
