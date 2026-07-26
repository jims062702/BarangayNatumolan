import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { Resident, VawcCase } from "../../types";

const VIOLENCE_TYPES = ["Physical", "Psychological", "Economic", "Sexual", "Mixed"];

export default function VawcCasesList() {
  const [rows, setRows] = useState<VawcCase[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [survivor, setSurvivor] = useState<Resident | null>(null);
  const [violenceType, setViolenceType] = useState(VIOLENCE_TYPES[0]);
  const [relationship, setRelationship] = useState("");
  const [childrenInvolved, setChildrenInvolved] = useState(false);
  const [childrenCount, setChildrenCount] = useState("0");
  const [immediateNeeds, setImmediateNeeds] = useState("");
  const [narrative, setNarrative] = useState("");
  const [notes, setNotes] = useState("");

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

  const intake = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "File this confidential case?", confirmText: "Yes, file case" }))) return;
    setFeedback("");
    try {
      await api.post("/vawc/cases", {
        survivor_id: survivor?.id,
        violence_type: violenceType,
        relationship_to_offender: relationship || undefined,
        children_involved: childrenInvolved,
        children_count: Number(childrenCount),
        immediate_needs: immediateNeeds || undefined,
        incident_narrative: narrative || undefined,
        confidential_notes: notes || undefined,
      });
      setIntakeOpen(false);
      setSurvivor(null);
      setNarrative("");
      setNotes("");
      setFeedback("Case recorded confidentially. A case code was assigned in place of the survivor's name.");
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

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

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

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
              render: (c: VawcCase) => new Date(c.report_date).toLocaleDateString("en-PH"),
            },
            {
              header: "Children Involved",
              render: (c: VawcCase) => (c.children_involved ? `Yes (${c.children_count})` : "No"),
            },
            { header: "Officer", render: (c: VawcCase) => c.officer?.name ?? "—" },
            { header: "Status", render: (c: VawcCase) => <StatusBadge status={c.status} /> },
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

      <Modal open={intakeOpen} onClose={() => setIntakeOpen(false)} title="Confidential Client Intake" wide>
        <form onSubmit={intake} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Survivor (resident record)" required hint="Only the case code will appear in lists">
              <ResidentPicker value={survivor} onChange={setSurvivor} />
            </FormField>
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
          <FormField label="Children / dependents involved?">
            <label className="flex h-[42px] cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={childrenInvolved}
                onChange={(e) => setChildrenInvolved(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Yes
            </label>
          </FormField>
          <FormField label="Number of children">
            <input
              type="number"
              min="0"
              value={childrenCount}
              onChange={(e) => setChildrenCount(e.target.value)}
              disabled={!childrenInvolved}
              className={inputClasses}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Immediate needs">
              <input
                value={immediateNeeds}
                onChange={(e) => setImmediateNeeds(e.target.value)}
                className={inputClasses}
                placeholder="e.g. medical attention, temporary shelter, BPO"
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Incident narrative" hint="Stored encrypted">
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={3}
                className={`${inputClasses} resize-none`}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Confidential interview notes" hint="Stored encrypted; visible to VAWC personnel only">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={`${inputClasses} resize-none`}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
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
    </div>
  );
}
