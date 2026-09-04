import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
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
import PhoneInput from "../../components/UI/PhoneInput";
import ResidentPicker from "../../components/ResidentPicker";
import ResidentMultiPicker from "../../components/ResidentMultiPicker";
import type { LuponCase, Resident } from "../../types";

const RELATIONSHIPS = ["Family", "Neighbor", "Business", "Friend", "Other"];

/**
 * What the Lupon has to do next on a case, so the docket reads as a worklist
 * rather than an archive. Everything happens on the case page except
 * post-settlement compliance, which lives in the settlement register.
 */
function nextStep(c: LuponCase): { label: string; to: string } {
  const open = `/lupon/cases/${c.id}`;

  if (c.jurisdiction_status === "Rejected") return { label: "Rejected — review", to: open };
  if (["Dismissed", "Referred"].includes(c.current_stage))
    return { label: `Closed — ${c.current_stage.toLowerCase()}`, to: open };

  switch (c.current_stage) {
    case "Filed":
      return { label: "Screen & schedule mediation", to: open };
    case "Mediation":
      return { label: "Record mediation outcome", to: open };
    case "Conciliation":
      return { label: "Constitute Pangkat & conciliate", to: open };
    case "Arbitration":
      return { label: "Record arbitration award", to: open };
    case "Settled":
      // Reaching agreement at mediation moves the stage but does not write the
      // settlement — until the terms are recorded the case is nowhere on the
      // compliance register, so send the clerk back to the case to record them.
      return c.settlement
        ? { label: "Monitor compliance", to: "/lupon/settlements" }
        : { label: "Record settlement terms", to: open };
    default:
      return { label: "Open case", to: open };
  }
}

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
  const navigate = useNavigate();
  const [rows, setRows] = useState<LuponCase[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState("");

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [complainant, setComplainant] = useState<Resident | null>(null);
  // KP venue follows the respondent, so the complainant may live elsewhere.
  const [outsideComplainant, setOutsideComplainant] = useState(false);
  const [outsideName, setOutsideName] = useState("");
  const [outsideAddress, setOutsideAddress] = useState("");
  const [outsideContact, setOutsideContact] = useState("");
  // A dispute can name more than one respondent.
  const [respondents, setRespondents] = useState<Resident[]>([]);
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState(CLASSIFICATIONS[0]);
  const [narrative, setNarrative] = useState("");
  const [occurrenceDate, setOccurrenceDate] = useState("");
  const [place, setPlace] = useState("");
  // Starts unset so the clerk makes a deliberate choice, not an accepted default.
  const [relationship, setRelationship] = useState("");

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

  /** Clears the intake draft. Used on cancel and after a successful file. */
  const resetIntake = () => {
    setTitle("");
    setNarrative("");
    setClassification(CLASSIFICATIONS[0]);
    setComplainant(null);
    setOutsideComplainant(false);
    setOutsideName("");
    setOutsideAddress("");
    setOutsideContact("");
    setRespondents([]);
    setOccurrenceDate("");
    setPlace("");
    setRelationship("");
  };

  const closeIntake = () => {
    setIntakeOpen(false);
    resetIntake();
  };

  const intake = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "File this Lupon case?", confirmText: "Yes, file case" }))) return;
    setBlocked("");
    try {
      const response = await api.post("/lupon/cases", {
        case_title: title,
        case_classification: classification,
        ...(outsideComplainant
          ? {
              complainant_name: outsideName,
              complainant_address: outsideAddress || undefined,
              complainant_contact: outsideContact || undefined,
            }
          : { complainant_id: complainant?.id }),
        respondent_ids: respondents.map((r) => r.id),
        complaint_narrative: narrative,
        date_of_occurrence: occurrenceDate,
        place_of_occurrence: place,
        relationship_nature: relationship,
      });
      setIntakeOpen(false);
      resetIntake();
      // Land the clerk on the case itself — jurisdiction screening, hearings,
      // mediation and settlement all happen there, and a case left sitting in
      // the docket is a case nobody is working.
      navigate(`/lupon/cases/${response.data.data.id}`);
    } catch (err) {
      const message = errorMessage(err);
      if (message.toLowerCase().includes("vawc")) {
        setIntakeOpen(false);
        setBlocked(message);
      } else {
        toast(message);
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

      <div className="mb-4 rounded-2xl border border-gray bg-secondary px-4 py-3 text-xs text-gray-500">
        A filed case is worked on its own page: jurisdiction screening →
        mediation by the Punong Barangay → Pangkat conciliation if that fails →
        settlement. Use <strong className="text-dark">Next step</strong> below
        to go straight to what the case needs; compliance after a settlement is
        tracked in{" "}
        <Link to="/lupon/settlements" className="font-semibold text-primary hover:underline">
          Settlements
        </Link>
        .
      </div>

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
                  {c.complainant_display_name ?? "—"}
                  {/* Badge sits with the complainant — it describes who filed,
                      not who was complained against. */}
                  {c.complainant_is_resident === false && (
                    <span className="mx-1 rounded-full bg-gray px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                      non-resident
                    </span>
                  )}{" "}
                  vs {c.respondent_display_names || "—"}
                </span>
              ),
            },
            {
              header: "Filed",
              render: (c: LuponCase) => new Date(c.date_filed).toLocaleDateString("en-PH"),
            },
            { header: "Jurisdiction", render: (c: LuponCase) => <StatusBadge status={c.jurisdiction_status} /> },
            { header: "Stage", render: (c: LuponCase) => <StatusBadge status={c.current_stage} /> },
            {
              header: "Next step",
              render: (c: LuponCase) => {
                const step = nextStep(c);
                return (
                  <Link
                    to={step.to}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    {step.label}
                    <FiArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                );
              },
            },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          searchable
          searchPlaceholder="Search by case #, title, or party…"
          getSearchText={(c) =>
            `${c.case_number} ${c.case_title} ${c.case_classification} ${
              c.complainant_display_name ?? ""
            } ${c.respondent_display_names ?? ""}`
          }
          filters={[{ label: "Stage", getValue: (c) => c.current_stage }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No cases on the docket."
        />
      </Card>

      <Modal open={intakeOpen} onClose={closeIntake} title="Complaint Intake & Screening" size="xl">
        <p className="mb-3 text-xs text-warning">
          VAWC and child-abuse matters are outside KP jurisdiction and are blocked automatically.
        </p>
        <form onSubmit={intake} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <FormField label="Complainant" required plain>
              {outsideComplainant ? (
                <input
                  value={outsideName}
                  onChange={(e) => setOutsideName(e.target.value)}
                  required
                  className={inputClasses}
                  placeholder="Full name"
                />
              ) : (
                <ResidentPicker
                  value={complainant}
                  onChange={setComplainant}
                  excludeIds={respondents.map((r) => r.id)}
                />
              )}
            </FormField>
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-dark">
              <input
                type="checkbox"
                checked={outsideComplainant}
                onChange={(e) => {
                  setOutsideComplainant(e.target.checked);
                  setComplainant(null);
                }}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              Not a resident of this barangay
            </label>
          </div>

          <div className="sm:col-span-1 lg:col-span-2">
            <FormField
              label="Respondent(s)"
              required
              plain
              hint="One or more. KP venue follows where the respondent lives, so a complainant from another barangay may file here."
            >
              <ResidentMultiPicker
                value={respondents}
                onChange={setRespondents}
                excludeIds={complainant ? [complainant.id] : []}
              />
            </FormField>
          </div>

          {outsideComplainant && (
            <>
              <FormField label="Complainant address">
                <input
                  value={outsideAddress}
                  onChange={(e) => setOutsideAddress(e.target.value)}
                  className={inputClasses}
                  placeholder="Barangay / municipality"
                />
              </FormField>
              <FormField label="Complainant contact number">
                <PhoneInput value={outsideContact} onChange={setOutsideContact} />
              </FormField>
              <p className="self-end pb-2.5 text-xs text-gray-400">
                They will receive notices by summons rather than in-system.
              </p>
            </>
          )}

          <div className="sm:col-span-1 lg:col-span-2">
            <FormField label="Case title" required>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClasses} />
            </FormField>
          </div>
          <FormField label="Classification" required>
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className={inputClasses}>
              {CLASSIFICATIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Date of occurrence" required>
            <input type="date" value={occurrenceDate} onChange={(e) => setOccurrenceDate(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Place of occurrence" required>
            <input value={place} onChange={(e) => setPlace(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Relationship between parties" required>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              required
              className={inputClasses}
            >
              <option value="">Select relationship…</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </FormField>

          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Nature of dispute / narrative" required>
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                required
                rows={2}
                className={`${inputClasses} resize-none`}
              />
            </FormField>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={respondents.length === 0 || (outsideComplainant ? !outsideName.trim() : !complainant)}
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
