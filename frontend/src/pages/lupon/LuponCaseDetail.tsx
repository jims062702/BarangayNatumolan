import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { formatWallClock } from "../../lib/datetime";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { LuponCase } from "../../types";

const STAGES = ["Filed", "Mediation", "Conciliation", "Settled"];

/**
 * Where a case has actually been, read from what happened to it.
 *
 * The bar used to colour itself from `current_stage` alone, by looking that
 * one word up in the list above. Every case that had LEFT the track came out
 * with nothing highlighted at all — "Referred" is not in the list, so the
 * lookup returned -1 and the whole path went grey — which is exactly the
 * case an office most needs to read, and exactly the one that told them
 * nothing.
 *
 * So the steps are lit from the case's own history: a mediation was held or
 * it was not. That is a fact on the record, and it stays true after the case
 * has moved on.
 */
function reachedStages(caseData: LuponCase): Set<string> {
  const held = (type: string) =>
    (caseData.hearings ?? []).some((h) => h.hearing_type === type);

  const reached = new Set<string>(["Filed"]);

  if (held("Mediation") || ["Mediation", "Conciliation", "Arbitration", "Settled", "Referred"]
    .includes(caseData.current_stage)) {
    reached.add("Mediation");
  }

  // Conciliation only if a Pangkat actually sat. A case referred straight
  // from mediation never reached it, and saying otherwise would hide that
  // the Pangkat step was skipped.
  if (held("Conciliation") || ["Conciliation", "Settled"].includes(caseData.current_stage)) {
    reached.add("Conciliation");
  }

  if (caseData.current_stage === "Settled" || caseData.settlement) {
    reached.add("Settled");
  }

  return reached;
}

/** Where the case stands now, in the words the flowchart uses. */
const EXIT_GUIDE: Record<string, { what: string; next: string }> = {
  Referred: {
    what: "Conciliation ended without an agreement, so a Certificate to File Action was issued.",
    next: "The complainant may now take the matter to the city or municipal court. The Lupon has done what the law asks of it.",
  },
  Dismissed: {
    what: "The case was dropped — withdrawn, outside this Lupon's jurisdiction, or the complainant did not pursue it.",
    next: "Nothing further is scheduled. The record stays on the docket.",
  },
  Arbitration: {
    what: "Both parties agreed in writing to let the Punong Barangay or the Pangkat decide for them.",
    next: "The award is handed down not earlier than 6 days and not later than 15 days from the agreement, and is transmitted to the court within 5 days.",
  },
};

/**
 * What each stage means and the period the law allows for it, so the docket
 * is readable without a copy of the Local Government Code on the desk.
 */
const STAGE_GUIDE: Record<string, { what: string; period: string }> = {
  Filed: {
    what: "Complaint received and docketed. Screen it for jurisdiction — both the subject matter and the respondent's residence — before setting any hearing.",
    period: "Screen and set the first hearing promptly.",
  },
  Mediation: {
    what: "The Punong Barangay personally mediates between the parties. No Pangkat yet, no lawyers — the parties speak for themselves.",
    period: "15 days from the first meeting.",
  },
  Conciliation: {
    what: "Mediation failed, so a Pangkat ng Tagapagkasundo — three Lupon members chosen by the parties — takes over and conciliates.",
    period: "15 days from the Pangkat's first meeting, extendable by 15 more.",
  },
  Settled: {
    what: "The parties signed an amicable settlement, or the Pangkat handed down an arbitration award. Record the terms and any compliance deadline.",
    period: "Final after 10 days unless repudiated; enforceable like a court judgment.",
  },
};

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
const localNow = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

function daysLeft(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default function LuponCaseDetail() {
  const { id } = useParams();
  const [caseData, setCaseData] = useState<LuponCase | null>(null);

  const [hearingOpen, setHearingOpen] = useState(false);
  const [hearingType, setHearingType] = useState("Mediation");
  const [hearingAt, setHearingAt] = useState("");
  const [summons, setSummons] = useState(true);

  const [mediationOpen, setMediationOpen] = useState(false);
  const [mediationDate, setMediationDate] = useState(localNow);
  const [attendance, setAttendance] = useState("Both Present");
  const [mediationOutcome, setMediationOutcome] = useState("Settlement Reached");
  const [mediationNotes, setMediationNotes] = useState("");

  const [conciliationOpen, setConciliationOpen] = useState(false);
  const [conciliationDate, setConciliationDate] = useState(localNow);
  // Exactly three, per the Local Government Code — one field each, so the
  // panel's composition is explicit rather than a comma-separated guess.
  const [pangkat, setPangkat] = useState(["", "", ""]);
  const [conciliationOutcome, setConciliationOutcome] = useState("Settlement");

  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementType, setSettlementType] = useState("Amicable Settlement");
  const [terms, setTerms] = useState("");
  const [dateAgreed, setDateAgreed] = useState(new Date().toISOString().slice(0, 10));
  const [complianceDeadline, setComplianceDeadline] = useState("");

  const load = () => {
    api.get(`/lupon/cases/${id}`).then((r) => setCaseData(r.data.data)).catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const post = async (url: string, payload: object, close?: () => void, message = "Saved.") => {
    if (!(await confirmAction({ title: "Save this change to the case?", confirmText: "Yes, save" }))) return;
    try {
      const response = await api.post(url, payload);
      close?.();
      toast(response.data.message ?? message);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (!caseData) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading case…</p>;
  }

  const settlement = caseData.settlement;
  const stageIndex = STAGES.indexOf(caseData.current_stage);
  const reached = reachedStages(caseData);

  return (
    <div>
      <Link to="/lupon/cases" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <FiArrowLeft aria-hidden="true" /> Back to docket
      </Link>

      <PageHeader
        title={`${caseData.case_number} — ${caseData.case_title}`}
        subtitle={`${caseData.case_classification} · filed ${new Date(caseData.date_filed).toLocaleDateString("en-PH", { dateStyle: "long" })}`}
        actions={<StatusBadge status={caseData.current_stage} />}
      />

      {/*
        The Katarungang Pambarangay path, with the steps this case actually
        took. Three states, because "we went through it", "we are in it" and
        "we never got there" are three different things — and a bar that
        could only say two of them was what made a referred case unreadable.
      */}
      <div className="mb-6 rounded-2xl border border-gray bg-white p-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STAGES.map((stage, index) => {
            const here = caseData.current_stage === stage;
            const been = reached.has(stage);

            return (
              <div key={stage} className="flex items-center">
                <div
                  className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold ${
                    here
                      ? "bg-primary text-white ring-2 ring-primary/30"
                      : been
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-gray-400"
                  }`}
                >
                  {index + 1}. {stage}
                  {here && <span className="font-normal opacity-90">· now</span>}
                </div>
                {index < STAGES.length - 1 && (
                  <span className="mx-1 h-0.5 w-6 bg-gray" aria-hidden="true" />
                )}
              </div>
            );
          })}

          {/*
            Arbitration is a branch off the main line, not a step along it —
            the flowchart draws it to one side, reachable from mediation or
            from conciliation when both parties agree to it.
          */}
          {(caseData.current_stage === "Arbitration" || reached.has("Arbitration")) && (
            <>
              <span className="mx-1 h-0.5 w-6 bg-gray" aria-hidden="true" />
              <div className="whitespace-nowrap rounded-full bg-warning/20 px-4 py-1.5 text-xs font-semibold text-amber-700">
                Arbitration · now
              </div>
            </>
          )}

          {["Dismissed", "Referred"].includes(caseData.current_stage) && (
            <>
              <span className="mx-1 h-0.5 w-6 bg-gray" aria-hidden="true" />
              <div className="whitespace-nowrap rounded-full bg-danger/10 px-4 py-1.5 text-xs font-semibold text-danger">
                {caseData.current_stage} · left the track
              </div>
            </>
          )}
        </div>

        {/* Which steps were skipped, said out loud rather than left as a gap. */}
        {["Dismissed", "Referred"].includes(caseData.current_stage)
          && !reached.has("Conciliation") && (
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            No Pangkat ng Tagapagkasundo sat on this case — it left the track before
            conciliation.
          </p>
        )}
      </div>

      {/* What the current stage means and how long the law allows for it. */}
      {STAGE_GUIDE[caseData.current_stage] && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm font-semibold text-dark">
            Stage {stageIndex + 1} of {STAGES.length}: {caseData.current_stage}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {STAGE_GUIDE[caseData.current_stage].what}
          </p>
          <p className="mt-1 text-xs font-medium text-primary">
            Period allowed: {STAGE_GUIDE[caseData.current_stage].period}
          </p>
        </div>
      )}

      {/*
        What the exit means and what happens next. The banner used to say
        only that the case had left the track, which is the one thing the
        badge beside the title already said.
      */}
      {EXIT_GUIDE[caseData.current_stage] && (
        <div className="mb-6 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3">
          <p className="text-sm font-semibold text-dark">{caseData.current_stage}</p>
          <p className="mt-1 text-sm text-gray-700">
            {EXIT_GUIDE[caseData.current_stage].what}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {EXIT_GUIDE[caseData.current_stage].next}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Complaint">
          <dl className="space-y-2.5 text-sm">
            {[
              /*
                A complainant on the register is not asked for an address —
                theirs is already recorded, and the register is where it is
                kept current. Read from there rather than copied at filing
                time: a summons served six weeks later goes to where they
                live now, not where they lived when they complained.

                Somebody from another barangay has no record here, so their
                details were typed in and are shown as typed.
              */
              [
                "Complainant",
                caseData.complainant_is_resident === false
                  ? `${caseData.complainant_display_name} (not a barangay resident)`
                  : `${caseData.complainant_display_name ?? "—"}${
                      caseData.complainant_reference ? ` · ${caseData.complainant_reference}` : ""
                    }`,
              ],
              ["Complainant address", caseData.complainant_display_address || "—"],
              ["Complainant contact", caseData.complainant_display_contact || "—"],
              [
                caseData.respondents && caseData.respondents.length > 1 ? "Respondents" : "Respondent",
                caseData.respondent_display_names || "—",
              ],
              ["Occurred", caseData.complaint ? new Date(caseData.complaint.date_of_occurrence).toLocaleDateString("en-PH") : "—"],
              ["Place", caseData.complaint?.place_of_occurrence ?? "—"],
              ["Relationship", caseData.complaint?.relationship_nature ?? "—"],
              ["Jurisdiction", caseData.jurisdiction_status],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-gray/60 pb-2 last:border-0">
                <dt className="text-gray-500">{label}</dt>
                <dd className="text-right font-medium text-dark">{value}</dd>
              </div>
            ))}
          </dl>
          {caseData.complaint && (
            <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-dark">
              {caseData.complaint.complaint_narrative}
            </p>
          )}
          {caseData.jurisdiction_status !== "Accepted" && caseData.rejection_reason && (
            <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{caseData.rejection_reason}</p>
          )}
          <button
            type="button"
            onClick={() => post(`/lupon/cases/${id}/screen-jurisdiction`, {}, undefined)}
            className="mt-4 w-full cursor-pointer rounded-full border border-primary/30 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Run jurisdiction screening
          </button>
        </Card>

        <Card
          title="Hearings & summons"
          action={
            <button type="button" onClick={() => setHearingOpen(true)} className="cursor-pointer text-sm font-medium text-primary hover:underline">
              + Schedule
            </button>
          }
        >
          {(caseData.hearings ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No hearings yet.</p>
          ) : (
            <ul className="space-y-3">
              {caseData.hearings?.map((hearing) => (
                <li key={hearing.id} className="rounded-xl bg-secondary p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-dark">{hearing.hearing_type}</p>
                    <StatusBadge status={hearing.status} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatWallClock(hearing.scheduled_at)}
                    {hearing.summons_issued && " · Summons issued"}
                  </p>
                  {hearing.outcome && <p className="mt-1 text-xs font-medium text-primary">{hearing.outcome}</p>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMediationOpen(true)}
              className="cursor-pointer rounded-full border border-primary/30 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Record mediation
            </button>
            <button
              type="button"
              onClick={() => setConciliationOpen(true)}
              className="cursor-pointer rounded-full border border-primary/30 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Record conciliation
            </button>
          </div>
        </Card>

        <Card
          title="Settlement & compliance"
          action={
            !settlement && (
              <button type="button" onClick={() => setSettlementOpen(true)} className="cursor-pointer text-sm font-medium text-primary hover:underline">
                + Record
              </button>
            )
          }
        >
          {!settlement ? (
            <p className="py-4 text-center text-sm text-gray-400">No settlement recorded.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-dark">{settlement.settlement_type}</p>
                <StatusBadge status={settlement.status} />
              </div>
              <p className="rounded-xl bg-secondary p-3 text-dark">{settlement.terms}</p>
              <p className="text-xs text-gray-500">
                Agreed {new Date(settlement.date_agreed).toLocaleDateString("en-PH")} · Repudiation deadline{" "}
                {new Date(settlement.repudiation_deadline).toLocaleDateString("en-PH")}
              </p>
              {settlement.status === "Within Repudiation Period" && (
                <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs font-bold text-warning">
                  {daysLeft(settlement.repudiation_deadline)} day(s) left in the 10-day repudiation window
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {settlement.status === "Within Repudiation Period" && (
                  <>
                    <button type="button" onClick={() => post(`/lupon/cases/${id}/settlement-action`, { action: "repudiate" })} className="cursor-pointer rounded-full border border-danger/40 py-2 text-xs font-semibold text-danger hover:bg-danger hover:text-white">
                      Repudiate
                    </button>
                    <button type="button" onClick={() => post(`/lupon/cases/${id}/settlement-action`, { action: "finalize" })} className="cursor-pointer rounded-full border border-success/40 py-2 text-xs font-semibold text-success hover:bg-success hover:text-white">
                      Mark final
                    </button>
                  </>
                )}
                {["Final", "Not Complied"].includes(settlement.status) && (
                  <>
                    <button type="button" onClick={() => post(`/lupon/cases/${id}/settlement-action`, { action: "mark_complied" })} className="cursor-pointer rounded-full border border-success/40 py-2 text-xs font-semibold text-success hover:bg-success hover:text-white">
                      Complied
                    </button>
                    <button type="button" onClick={() => post(`/lupon/cases/${id}/settlement-action`, { action: "mark_not_complied" })} className="cursor-pointer rounded-full border border-danger/40 py-2 text-xs font-semibold text-danger hover:bg-danger hover:text-white">
                      Not complied
                    </button>
                    <button type="button" onClick={() => post(`/lupon/cases/${id}/settlement-action`, { action: "execute" })} className="cursor-pointer rounded-full border border-primary/40 py-2 text-xs font-semibold text-primary hover:bg-primary hover:text-white">
                      Execute
                    </button>
                  </>
                )}
                {!settlement.cfa_issued && (
                  <button type="button" onClick={() => post(`/lupon/cases/${id}/settlement-action`, { action: "issue_cfa" })} className="cursor-pointer rounded-full border border-gray py-2 text-xs font-semibold text-gray-500 hover:border-primary hover:text-primary">
                    Issue CFA
                  </button>
                )}
              </div>
              {settlement.cfa_issued && (
                <p className="text-xs font-semibold text-danger">Certificate to File Action issued.</p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Hearing modal */}
      <Modal open={hearingOpen} onClose={() => setHearingOpen(false)} title="Schedule hearing">
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            post(
              `/lupon/cases/${id}/hearings`,
              { hearing_type: hearingType, scheduled_at: hearingAt.replace("T", " ") + ":00", summons_issued: summons },
              () => setHearingOpen(false),
              "Hearing scheduled; parties notified."
            );
          }}
          className="space-y-4"
        >
          <FormField label="Type" required>
            <select value={hearingType} onChange={(e) => setHearingType(e.target.value)} className={inputClasses}>
              <option>Mediation</option>
              <option>Conciliation</option>
              <option>Arbitration</option>
            </select>
          </FormField>
          <FormField label="Date & time" required>
            <input type="datetime-local" value={hearingAt} onChange={(e) => setHearingAt(e.target.value)} required className={inputClasses} />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={summons} onChange={(e) => setSummons(e.target.checked)} className="h-4 w-4 accent-primary" />
            Summons issued to parties
          </label>
          <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Schedule
          </button>
        </form>
      </Modal>

      {/* Mediation modal */}
      <Modal open={mediationOpen} onClose={() => setMediationOpen(false)} title="Record mediation (Punong Barangay)">
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            post(
              `/lupon/cases/${id}/mediation`,
              {
                mediation_date: mediationDate.replace("T", " ") + ":00",
                attendance,
                outcome: mediationOutcome,
                proceedings_notes: mediationNotes || undefined,
              },
              () => setMediationOpen(false)
            );
          }}
          className="space-y-4"
        >
          <FormField label="Date" required>
            <input
              type="datetime-local"
              value={mediationDate}
              max={localNow()}
              onChange={(e) => setMediationDate(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>
          <FormField label="Attendance" required>
            <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className={inputClasses}>
              {["Both Present", "Complainant Only", "Respondent Only", "Neither"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Outcome" required>
            <select value={mediationOutcome} onChange={(e) => setMediationOutcome(e.target.value)} className={inputClasses}>
              {["Settlement Reached", "No Settlement", "Rescheduled"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Proceedings notes">
            <textarea value={mediationNotes} onChange={(e) => setMediationNotes(e.target.value)} rows={2} className={`${inputClasses} resize-none`} />
          </FormField>
          <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Save mediation
          </button>
        </form>
      </Modal>

      {/* Conciliation modal */}
      <Modal open={conciliationOpen} onClose={() => setConciliationOpen(false)} title="Record Pangkat conciliation">
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            post(
              `/lupon/cases/${id}/conciliation`,
              {
                conciliation_date: conciliationDate.replace("T", " ") + ":00",
                pangkat_members: pangkat.map((m) => m.trim()),
                outcome: conciliationOutcome,
              },
              () => setConciliationOpen(false)
            );
          }}
          className="space-y-4"
        >
          <FormField label="Date" required>
            <input
              type="datetime-local"
              value={conciliationDate}
              max={localNow()}
              onChange={(e) => setConciliationDate(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-dark">
              Pangkat ng Tagapagkasundo<span className="text-danger"> *</span>
            </span>
            <div className="space-y-2">
              {pangkat.map((member, index) => (
                <input
                  key={index}
                  value={member}
                  onChange={(e) =>
                    setPangkat((prev) => prev.map((m, i) => (i === index ? e.target.value : m)))
                  }
                  required
                  className={inputClasses}
                  placeholder={`Lupon member ${index + 1}${index === 0 ? " (chairman)" : ""}`}
                />
              ))}
            </div>
            <span className="mt-1 block text-xs text-gray-400">
              Exactly three Lupon members, chosen by the parties from the Lupon
              list — or drawn by lot if they cannot agree. The panel elects its
              own chairman and secretary.
            </span>
          </div>
          <FormField label="Outcome" required>
            <select value={conciliationOutcome} onChange={(e) => setConciliationOutcome(e.target.value)} className={inputClasses}>
              {["Settlement", "Arbitration", "Dismissed"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </FormField>
          <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Save conciliation
          </button>
        </form>
      </Modal>

      {/* Settlement modal */}
      <Modal open={settlementOpen} onClose={() => setSettlementOpen(false)} title="Record settlement">
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            post(
              `/lupon/cases/${id}/settlement`,
              {
                settlement_type: settlementType,
                terms,
                date_agreed: dateAgreed,
                compliance_deadline: complianceDeadline || undefined,
              },
              () => setSettlementOpen(false),
              "Settlement recorded — the 10-day repudiation countdown has started."
            );
          }}
          className="space-y-4"
        >
          <FormField label="Type" required>
            <select value={settlementType} onChange={(e) => setSettlementType(e.target.value)} className={inputClasses}>
              <option>Amicable Settlement</option>
              <option>Arbitration Award</option>
            </select>
          </FormField>
          <FormField label="Terms & obligations" required>
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} required rows={3} className={`${inputClasses} resize-none`} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Date agreed" required>
              <input type="date" value={dateAgreed} onChange={(e) => setDateAgreed(e.target.value)} required className={inputClasses} />
            </FormField>
            <FormField label="Compliance deadline">
              <input type="date" value={complianceDeadline} onChange={(e) => setComplianceDeadline(e.target.value)} className={inputClasses} />
            </FormField>
          </div>
          <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Record settlement
          </button>
        </form>
      </Modal>
    </div>
  );
}
