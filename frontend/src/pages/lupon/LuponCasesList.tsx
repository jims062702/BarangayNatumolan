import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { LuponCase, Resident } from "../../types";

const CLASSIFICATIONS = [
  "Assault",
  "Theft",
  "Property Damage",
  "Libel",
  "Ejectment",
  "Debt",
  "Family Dispute",
  "Land Dispute",
  "Others",
];

export default function LuponCasesList() {
  const [rows, setRows] = useState<LuponCase[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [blocked, setBlocked] = useState("");

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [complainant, setComplainant] = useState<Resident | null>(null);
  const [respondent, setRespondent] = useState<Resident | null>(null);
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState(CLASSIFICATIONS[0]);
  const [narrative, setNarrative] = useState("");
  const [occurrenceDate, setOccurrenceDate] = useState("");
  const [place, setPlace] = useState("");
  const [relationship, setRelationship] = useState("Neighbor");

  const load = () => {
    setLoading(true);
    api
      .get("/lupon/cases", { params: { page } })
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
    setFeedback("");
    setBlocked("");
    try {
      await api.post("/lupon/cases", {
        case_title: title,
        case_classification: classification,
        complainant_id: complainant?.id,
        respondent_id: respondent?.id,
        complaint_narrative: narrative,
        date_of_occurrence: occurrenceDate,
        place_of_occurrence: place,
        relationship_nature: relationship,
      });
      setIntakeOpen(false);
      setTitle("");
      setNarrative("");
      setComplainant(null);
      setRespondent(null);
      setFeedback("Case filed and docketed.");
      load();
    } catch (err) {
      const message = errorMessage(err);
      if (message.toLowerCase().includes("vawc")) {
        setIntakeOpen(false);
        setBlocked(message);
      } else {
        setFeedback(message);
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="Katarungang Pambarangay — Case Docket"
        subtitle="Complaint intake, jurisdiction screening, mediation, and settlement"
        actions={
          <button
            type="button"
            onClick={() => setIntakeOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + File complaint
          </button>
        }
      />

      {blocked && (
        <div role="alert" className="mb-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3">
          <p className="text-sm font-bold text-danger">Outside KP jurisdiction — routed to VAWC Desk</p>
          <p className="mt-1 text-sm text-dark">{blocked}</p>
        </div>
      )}

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <Card>
        <DataTable
          columns={[
            {
              header: "Case #",
              render: (c: LuponCase) => (
                <Link to={`/lupon/cases/${c.id}`} className="font-medium text-primary hover:underline">
                  {c.case_number}
                </Link>
              ),
            },
            { header: "Title", render: (c: LuponCase) => c.case_title },
            { header: "Classification", render: (c: LuponCase) => c.case_classification },
            {
              header: "Parties",
              render: (c: LuponCase) => (
                <span className="text-xs">
                  {c.complainant?.last_name ?? "—"} vs {c.respondent?.last_name ?? "—"}
                </span>
              ),
            },
            {
              header: "Filed",
              render: (c: LuponCase) => new Date(c.date_filed).toLocaleDateString("en-PH"),
            },
            { header: "Jurisdiction", render: (c: LuponCase) => <StatusBadge status={c.jurisdiction_status} /> },
            { header: "Stage", render: (c: LuponCase) => <StatusBadge status={c.current_stage} /> },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          searchable
          searchPlaceholder="Search by case #, title, or party…"
          getSearchText={(c) =>
            `${c.case_number} ${c.case_title} ${c.case_classification} ${
              c.complainant?.last_name ?? ""
            } ${c.respondent?.last_name ?? ""}`
          }
          filters={[{ label: "Stage", getValue: (c) => c.current_stage }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No cases on the docket."
        />
      </Card>

      <Modal open={intakeOpen} onClose={() => setIntakeOpen(false)} title="Complaint Intake & Screening" wide>
        <p className="mb-4 rounded-xl bg-warning/10 px-4 py-2.5 text-xs text-dark">
          VAWC and child-abuse matters are outside KP jurisdiction and will be
          blocked automatically — route those clients to the VAWC Desk.
        </p>
        <form onSubmit={intake} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Complainant" required>
            <ResidentPicker value={complainant} onChange={setComplainant} />
          </FormField>
          <FormField label="Respondent" required>
            <ResidentPicker value={respondent} onChange={setRespondent} />
          </FormField>
          <FormField label="Case title" required>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Classification" required>
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className={inputClasses}>
              {CLASSIFICATIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Nature of dispute / narrative" required>
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                required
                rows={3}
                className={`${inputClasses} resize-none`}
              />
            </FormField>
          </div>
          <FormField label="Date of occurrence" required>
            <input type="date" value={occurrenceDate} onChange={(e) => setOccurrenceDate(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Place of occurrence" required>
            <input value={place} onChange={(e) => setPlace(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Relationship between parties" required>
            <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClasses}>
              {["Family", "Neighbor", "Business", "Friend", "Other"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!complainant || !respondent}
              className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              File case
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
