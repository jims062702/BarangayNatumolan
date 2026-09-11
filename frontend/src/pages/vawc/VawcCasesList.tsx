import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { formatWallClock } from "../../lib/datetime";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import { FiEdit2, FiEye, FiPlus } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ChoiceGroup from "../../components/UI/ChoiceGroup";
import PhoneInput from "../../components/UI/PhoneInput";
import ResidentPicker from "../../components/ResidentPicker";
import ResidentMultiPicker from "../../components/ResidentMultiPicker";
import { personName } from "../../lib/names";
import type { Resident, VawcCase } from "../../types";
import PeriodFilter, {
  ALL_TIME,
  periodParams,
  type Period,
} from "../../components/UI/PeriodFilter";

const VIOLENCE_TYPES = ["Physical", "Psychological", "Economic", "Sexual", "Mixed"];

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
const localNow = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

/**
 * How urgent a case is, most first.
 *
 * Words, not colours. A colour is unreadable to a screen reader and
 * indistinguishable to a colour-blind officer, and this is the field that
 * decides who gets visited tonight.
 */
const RISK_LEVELS = ["Critical", "High", "Medium", "Low"] as const;

/**
 * Who the alleged offender is to the survivor.
 *
 * Typed free-hand before, so the same relationship arrived as "husband",
 * "Asawa", "live in partner" and "partner (live-in)" — four spellings that
 * no report could add up.
 *
 * The list follows RA 9262, which is written in terms of exactly these
 * relationships: a husband or former husband, someone she has or had a
 * sexual or dating relationship with, someone she has a child with, or her
 * own child. A relationship outside the list is still recordable — the law
 * did not anticipate every household, and neither does this.
 */
const OFFENDER_RELATIONSHIPS = [
  "Husband",
  "Former husband",
  "Live-in partner",
  "Former live-in partner",
  "Boyfriend",
  "Former boyfriend",
  "Father of her child",
  "Parent",
  "Child",
  "Sibling",
  "Other relative",
  "Employer",
  "Other",
];

/**
 * One band of the intake form.
 *
 * The form is long because the law asks a lot at one desk. Three headings
 * make it three shorter forms: who this is about, what happened and how
 * dangerous it is now, and what the office is keeping. Without them it is
 * twenty boxes in a column and the officer loses their place mid-interview.
 */
function Band({ title, hint, children }: {
  title: string;
  hint?: string;
  /** A band may be a heading on its own; the fields that follow are siblings. */
  children?: React.ReactNode;
}) {
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <div className="mb-2 border-b border-gray pb-1.5">
        <p className="text-sm font-bold text-dark">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      {children && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </div>
  );
}

/** How the complaint reached the barangay. */
const REPORTING_CHANNELS = [
  "Walk-in",
  "Referral",
  "Hotline",
  "Barangay official",
  "Health worker",
  "Police",
  "Other",
];

/**
 * What a survivor needs, as a list rather than a paragraph.
 *
 * Free text could not be counted, so nobody could answer "how many survivors
 * this quarter needed shelter?" — which is the question a barangay budget is
 * built on. "Other" stays, because the need nobody anticipated is exactly the
 * one worth reading.
 */
const IMMEDIATE_NEEDS = [
  "Medical assistance",
  "Temporary shelter",
  "Psychological support",
  "Legal assistance",
  "Protection order assistance",
  "Police intervention",
  "Financial assistance",
];
/**
 * How urgent a case is, said in words.
 *
 * Colour carries it too, but never alone: a colour is nothing to a screen
 * reader and two of these are indistinguishable to a colour-blind officer —
 * and this is the field that decides who gets visited tonight.
 *
 * "Not assessed" is its own state and is not dressed as Low. A case nobody
 * has judged is not a safe case; it is an unjudged one, and the docket should
 * say which.
 */
function RiskBadge({ level }: { level?: string | null }) {
  if (!level) {
    return <span className="text-xs text-gray-400">Not assessed</span>;
  }

  const tone: Record<string, string> = {
    Critical: "bg-danger text-white",
    High: "bg-danger/15 text-danger",
    Medium: "bg-warning/20 text-amber-700",
    Low: "bg-secondary text-gray-600",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone[level] ?? "bg-secondary text-gray-600"}`}>
      {level}
    </span>
  );
}

/**
 * When the case is next due, and whether that day has passed.
 *
 * A date on its own does not say "this one is late" — and late is the only
 * reason to read this column.
 */
function NextDue({ on }: { on?: string | null }) {
  if (!on) {
    return <span className="text-xs text-gray-400">None scheduled</span>;
  }

  const due = new Date(on);
  const overdue = due.setHours(23, 59, 59, 999) < Date.now();

  return (
    <span className={`text-xs ${overdue ? "font-bold text-danger" : "text-dark"}`}>
      {new Date(on).toLocaleDateString("en-PH", { dateStyle: "medium" })}
      {overdue && " · overdue"}
    </span>
  );
}
export default function VawcCasesList() {
  const [rows, setRows] = useState<VawcCase[]>([]);

  /* Which stretch of time the docket is showing. */
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [years, setYears] = useState<number[]>([]);
  /* How many records each period holds, for the picker itself. */
  const [periodCounts, setPeriodCounts] = useState<Record<string, number>>();
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [survivor, setSurvivor] = useState<Resident | null>(null);
  /*
   * Empty, not the first type.
   *
   * The dropdown was given a "Select type…" placeholder but the state still
   * started on VIOLENCE_TYPES[0] — so the box read "Physical" from the
   * moment it opened, and a form submitted without anybody reading that line
   * recorded physical violence. Changing what the list OFFERS without
   * changing what it HOLDS fixed nothing.
   */
  const [violenceType, setViolenceType] = useState("");
  const [relationship, setRelationship] = useState("");
  // Dependents are picked from the registry; the count follows the picks.
  const [dependents, setDependents] = useState<Resident[]>([]);
  // Off by default: most complaints come from the survivor herself, and the
  // reporting-party fields stay locked until the officer says otherwise.
  const [reportedByOther, setReportedByOther] = useState(false);
  const [reportedByName, setReportedByName] = useState("");
  /*
   * The reporter as a register record, when they are one.
   *
   * Held alongside the name rather than instead of it: whichever way the
   * clerk answered, the case keeps a readable name.
   */
  const [reportedByResident, setReportedByResident] = useState<Resident | null>(null);

  /*
   * Attach the reporter and take their number with them.
   *
   * Cleared as well as set: picking Ana after Ben must not leave Ben's
   * number sitting in the box under Ana's name.
   */
  const pickReporter = (person: Resident | null) => {
    setReportedByResident(person);
    setReportedByContact(person?.contact_number ?? "");
  };
  const [reporterOffRegister, setReporterOffRegister] = useState(false);

  /*
   * The number comes from the register, not from the clerk.
   *
   * True only when a picked person actually has one on file — which is the
   * minority — so everything downstream reads this rather than re-deriving
   * the same three conditions and getting one of them wrong.
   */
  const fromRecord = Boolean(
    reportedByOther && !reporterOffRegister && reportedByResident?.contact_number,
  );
  const [reportedByRelationship, setReportedByRelationship] = useState("");
  const [reportedByContact, setReportedByContact] = useState("");
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
  /*
   * The incident itself: when, where, and whether it is still happening.
   *
   * Everything else on this form is history. These are the only questions
   * that say whether she is safe tonight.
   */
  const [occurredAt, setOccurredAt] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  /*
   * Three answers, and "unanswered" is a fourth state.
   *
   * These were boolean|null, with null doing double duty as "Not known" AND
   * as "nobody has said" — so the form opened with "Not known" already
   * ticked, and an officer who never reached the question left an answer on
   * the record they had not given. Now null means only the second thing, and
   * nothing is ticked until somebody chooses.
   */
  const [isOngoing, setIsOngoing] = useState<string | null>(null);
  const [offenderNearby, setOffenderNearby] = useState<string | null>(null);
  const [riskLevel, setRiskLevel] = useState("");
  /* "Other" opens a box: the list cannot anticipate every household. */
  const [relationshipOther, setRelationshipOther] = useState("");
  const [channel, setChannel] = useState("");
  const [needs, setNeeds] = useState<string[]>([]);
  const [needsOther, setNeedsOther] = useState("");

  /**
   * A yes/no/not-known answer, as the column holds it.
   *
   * "Not known" is null, not false. Sending false would record "he is NOT
   * near her" when what the officer said was that she could not tell — and
   * on a risk assessment that is the difference between sending somebody
   * tonight and not.
   *
   * An unanswered question sends nothing at all, so the field is left as it
   * was rather than overwritten with a guess.
   */
  const yesNo = (answer: string | null): boolean | null | undefined => {
    if (answer === null) return undefined;

    return answer === "unknown" ? null : answer === "yes";
  };

  const toggleNeed = (need: string) =>
    setNeeds((prev) => (prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]));

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
      .get("/vawc/cases", { params: { page, ...periodParams(period) } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
        /* The window the server actually resolved, which is not always the
           one the buttons imply — a month with no year means this year. */
        setWindowLabel(r.data.data.window?.label ?? null);
        setYears(r.data.data.years ?? []);
        setPeriodCounts(r.data.data.period_counts);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, period]);

  /* A narrower window almost never has as many pages, and page 4 of a
     one-page result is an empty docket that looks like no cases at all. */
  const changePeriod = (next: Period) => {
    setPeriod(next);
    setPage(1);
  };

  // Live updates without a manual refresh.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("vawc_cases", () => load(true));

  /** Clears the confidential intake draft — nothing may survive a cancel. */
  const resetIntake = () => {
    setReportedByResident(null);
    setReporterOffRegister(false);
    setSurvivor(null);
    setViolenceType("");
    setRelationship("");
    setDependents([]);
    setReportedByOther(false);
    setReportedByName("");
    setReportedByRelationship("");
    setReportedByContact("");
    /*
     * The new boxes clear too. An intake form that opens holding the last
     * survivor's answers is how one person's incident ends up on another
     * person's case.
     */
    setNeeds([]);
    setNeedsOther("");
    setOccurredAt("");
    setIncidentLocation("");
    setIsOngoing(null);
    setOffenderNearby(null);
    setRelationshipOther("");
    setRiskLevel("");
    setChannel("");
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
        relationship_to_offender:
          relationship === "Other"
            ? (relationshipOther.trim() || "Other")
            : (relationship || undefined),
        dependent_ids: dependents.map((d) => d.id),
        reported_by_name: reportedByOther
          ? (reporterOffRegister
              ? reportedByName || undefined
              /* The picked person's name travels too, so the case still reads
                 correctly if that register record is ever removed. */
              : (reportedByResident ? personName(reportedByResident) : undefined))
          : undefined,
        reported_by_resident_id:
          reportedByOther && !reporterOffRegister ? reportedByResident?.id : undefined,
        reported_by_relationship: reportedByOther ? reportedByRelationship || undefined : undefined,
        reported_by_contact: reportedByOther ? reportedByContact || undefined : undefined,
        immediate_needs: needs.length ? needs : undefined,
        immediate_needs_other: needsOther || undefined,
        /*
         * A date, no clock. A survivor recalling last Tuesday does not
         * recall 14:35, and a box asking for one invites a number nobody
         * stands behind. Midnight is appended so the column stays a datetime.
         */
        occurred_at: occurredAt ? occurredAt + " 00:00:00" : undefined,
        incident_location: incidentLocation || undefined,
        /*
         * "Not known" is an answer and is sent as such — as null, which is
         * what the column holds. Leaving the question unanswered sends
         * nothing at all.
         */
        is_ongoing: yesNo(isOngoing),
        offender_nearby: yesNo(offenderNearby),
        risk_level: riskLevel || undefined,
        reporting_channel: channel || undefined,
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
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> Confidential intake
          </button>
        }
      />

      <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-dark">
        <strong>Reminder:</strong> VAWC cases are never mediated at the Lupon.
        Coordinate protective services immediately for high-risk situations.
      </div>

      <PeriodFilter
        value={period}
        onChange={changePeriod}
        years={years}
        counts={periodCounts}
        showing={windowLabel}
        count={total}
      />

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
            /*
             * Risk and the next visit, which are what the docket is opened
             * for. Everything else on this row is filing; these two are the
             * work.
             */
            { header: "Risk", render: (c: VawcCase) => <RiskBadge level={c.risk_level} /> },
            {
              header: "Next follow-up",
              render: (c: VawcCase) => <NextDue on={c.next_followup_date} />,
            },
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
                <RowActions>
                  <RowAction
                    label="Open case"
                    icon={FiEye}
                    tone="primary"
                    to={`/vawc/cases/${c.id}`}
                  />
                  <RowAction label="Edit case" icon={FiEdit2} onClick={() => openEdit(c)} />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by case code…"
          getSearchText={(c) => `${c.case_code} ${c.violence_type} ${c.status} ${c.risk_level ?? ""}`}
          filters={[
            { label: "Status", getValue: (c) => c.status },
            { label: "Violence Type", getValue: (c) => c.violence_type },
            /*
             * The docket is opened to find the urgent ones. Cases nobody has
             * judged group under their own label rather than vanishing — an
             * unjudged case is not a safe one.
             */
            { label: "Risk", getValue: (c) => c.risk_level ?? "Not assessed" },
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
          <Band
            title="A. Survivor and reporter"
            hint="Who this case is about, and who brought it in."
          />
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
              <FormField label="Name" plain>
                {reporterOffRegister ? (
                  <input
                    value={reportedByName}
                    disabled={!reportedByOther}
                    onChange={(e) => setReportedByName(e.target.value)}
                    className={inputClasses}
                    placeholder="Neighbour, relative, official…"
                  />
                ) : (
                  /* Searches the whole register — residents and recorded
                     non-residents alike. */
                  <ResidentPicker
                    value={reportedByResident}
                    onChange={pickReporter}
                    excludeIds={survivor ? [survivor.id] : []}
                  />
                )}

                {reportedByOther && (
                  <button
                    type="button"
                    onClick={() => {
                      setReporterOffRegister((was) => !was);
                      setReportedByResident(null);
                      setReportedByName("");
                      /* The number belonged to the person being dropped. */
                      setReportedByContact("");
                    }}
                    className="mt-1.5 cursor-pointer text-xs font-semibold text-primary hover:underline"
                  >
                    {reporterOffRegister
                      ? "Find them on the register instead"
                      : "Not on the register — type the name"}
                  </button>
                )}
              </FormField>
              <FormField label="Relationship to survivor">
                <input
                  value={reportedByRelationship}
                  disabled={!reportedByOther}
                  onChange={(e) => setReportedByRelationship(e.target.value)}
                  className={inputClasses}
                />
              </FormField>
              {/*
                Three situations, and the field says which one it is in.

                A resident WITH a number on file: taken from their record and
                locked, because the record is the source and editing a copy of
                it here would quietly disagree with it.

                A resident WITHOUT one — which is most of the register — stays
                typeable. An empty locked box would read as broken, and the
                desk still needs a way to reach them.

                Somebody not on the register: typed, as it always was.
              */}
              <FormField
                label="Contact number"
                hint={
                  fromRecord
                    ? "From their resident record"
                    : reportedByOther && !reporterOffRegister && reportedByResident
                      ? "No number on their record — type one"
                      : undefined
                }
              >
                <PhoneInput
                  value={reportedByContact}
                  onChange={setReportedByContact}
                  disabled={!reportedByOther || fromRecord}
                />
              </FormField>
            </div>
          </div>

          <FormField label="How the complaint reached us">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClasses}>
              <option value="">Not recorded</option>
              {REPORTING_CHANNELS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FormField>

          <Band
            title="B. The incident, and how dangerous it is now"
            hint="Everything above is who. This is what happened — and whether it is still happening."
          />

          {/*
            No default. "Physical" sat there pre-chosen, so a form submitted
            without anybody reading this line recorded physical violence —
            the commonest kind, which is exactly what makes the wrong answer
            hard to spot afterwards.
          */}
          <FormField label="Type of reported violence" required>
            <select
              value={violenceType}
              onChange={(e) => setViolenceType(e.target.value)}
              required
              className={inputClasses}
            >
              <option value="">Select type…</option>
              {VIOLENCE_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FormField>
          {/*
            When and where it happened — not when it was reported.

            The form recorded only the second. A prescription period runs
            from the act, and "last night" and "last year" are not the same
            case to anybody deciding what to do about it.
          */}
          {/*
            A date, no clock. A survivor recalling last Tuesday does not
            recall 14:35, and a box asking for one invites a number nobody
            stands behind.
          */}
          <FormField label="When did it happen?" hint="The date is enough.">
            <input
              type="date"
              value={occurredAt}
              max={localNow().slice(0, 10)}
              onChange={(e) => setOccurredAt(e.target.value)}
              className={inputClasses}
            />
          </FormField>

          <FormField label="Where did it happen?" hint="Stored encrypted">
            <input
              value={incidentLocation}
              onChange={(e) => setIncidentLocation(e.target.value)}
              className={inputClasses}
              placeholder="House, street, purok…"
            />
          </FormField>

          {/*
            The two questions the old form never asked, and the only two that
            are about tonight. An officer reading this decides whether to go
            now or to schedule a visit.
          */}
          {/*
            The two questions that are about tonight.

            ChoiceGroup rather than hand-rolled buttons, so the chosen answer
            carries a TICK and not only a shade of colour — and so that
            nothing is ticked until somebody actually chooses. "Not known" is
            an answer here, not the absence of one.
          */}
          <div className="sm:col-span-2 lg:col-span-3 grid gap-4 sm:grid-cols-2">
            <ChoiceGroup
              label="Is the incident still going on?"
              value={isOngoing}
              onChange={setIsOngoing}
              clearable
              onClear={() => setIsOngoing(null)}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "unknown", label: "Not known" },
              ]}
            />

            <ChoiceGroup
              label="Is the alleged offender with or near her now?"
              value={offenderNearby}
              onChange={setOffenderNearby}
              clearable
              onClear={() => setOffenderNearby(null)}
              options={[
                { value: "yes", label: "Yes", hint: "Treat this as immediate danger." },
                { value: "no", label: "No" },
                { value: "unknown", label: "Not known" },
              ]}
            />
          </div>

          {/*
            The officer's own judgement, in words rather than colours. It is
            the first assessment, not the last: every follow-up re-states it,
            so the docket shows what was last seen and not what was first
            assumed.
          */}
          <FormField
            label="Risk level"
            hint="Your assessment now. Each follow-up updates it."
          >
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className={inputClasses}
            >
              <option value="">Not assessed yet</option>
              {RISK_LEVELS.map((level) => <option key={level}>{level}</option>)}
            </select>
          </FormField>
          <FormField label="Relationship to alleged offender">
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className={inputClasses}
            >
              <option value="">Not recorded</option>
              {OFFENDER_RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
            </select>
            {/*
              Only when "Other" is chosen. A box that is always there gets
              filled in beside a chosen relationship, and the record then
              carries two answers to one question.
            */}
            {relationship === "Other" && (
              <input
                value={relationshipOther}
                onChange={(e) => setRelationshipOther(e.target.value)}
                placeholder="Say what the relationship is"
                maxLength={100}
                className={`${inputClasses} mt-2`}
              />
            )}
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

          {/*
            Needs as a list rather than a paragraph.

            Free text could not be counted, so nobody could answer "how many
            survivors this quarter needed shelter?" — which is the question a
            barangay budget is built on. "Other" stays, because the need
            nobody anticipated is exactly the one worth reading.
          */}
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField plain label="Immediate needs" hint="Stored encrypted. Tick all that apply.">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {IMMEDIATE_NEEDS.map((need) => (
                  <label
                    key={need}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray px-3 py-2 text-sm text-dark transition-colors hover:border-primary"
                  >
                    <input
                      type="checkbox"
                      checked={needs.includes(need)}
                      onChange={() => toggleNeed(need)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                    {need}
                  </label>
                ))}
              </div>
            </FormField>

            <div className="mt-2">
              <FormField label="Anything else she needs">
                <input
                  value={needsOther}
                  onChange={(e) => setNeedsOther(e.target.value)}
                  className={inputClasses}
                  placeholder="Not on the list above"
                />
              </FormField>
            </div>
          </div>

          <Band
            title="C. Confidential case notes"
            hint="Encrypted, and visible to VAWC personnel only."
          />

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
          {/*
            A textarea, because intake now writes one need per line. A
            single-line input would show the list as one run-on string and
            save it back that way — quietly destroying what was ticked.
          */}
          <FormField label="Immediate needs" hint="One per line.">
            <textarea
              value={editForm.immediate_needs}
              onChange={(e) => setEdit("immediate_needs", e.target.value)}
              rows={3}
              className={`${inputClasses} resize-y`}
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
