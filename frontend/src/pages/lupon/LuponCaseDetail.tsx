import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { formatWallClock } from "../../lib/datetime";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { LuponCase } from "../../types";

const STAGES = ["Filed", "Mediation", "Conciliation", "Settled"];

function daysLeft(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default function LuponCaseDetail() {
  const { id } = useParams();
  const [caseData, setCaseData] = useState<LuponCase | null>(null);
  const [feedback, setFeedback] = useState("");

  const [hearingOpen, setHearingOpen] = useState(false);
  const [hearingType, setHearingType] = useState("Mediation");
  const [hearingAt, setHearingAt] = useState("");
  const [summons, setSummons] = useState(true);

  const [mediationOpen, setMediationOpen] = useState(false);
  const [mediationDate, setMediationDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendance, setAttendance] = useState("Both Present");
  const [mediationOutcome, setMediationOutcome] = useState("Settlement Reached");
  const [mediationNotes, setMediationNotes] = useState("");

  const [conciliationOpen, setConciliationOpen] = useState(false);
  const [conciliationDate, setConciliationDate] = useState(new Date().toISOString().slice(0, 10));
  const [pangkat, setPangkat] = useState("");
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
    setFeedback("");
    try {
      const response = await api.post(url, payload);
      close?.();
      setFeedback(response.data.message ?? message);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  if (!caseData) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading case…</p>;
  }

  const settlement = caseData.settlement;
  const stageIndex = STAGES.indexOf(caseData.current_stage);

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

      {/* Stage stepper */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto rounded-2xl border border-gray bg-white p-4">
        {STAGES.map((stage, index) => (
          <div key={stage} className="flex items-center">
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold ${
                index <= stageIndex
                  ? "bg-primary text-white"
                  : "bg-secondary text-gray-400"
              }`}
            >
              {index + 1}. {stage}
            </div>
            {index < STAGES.length - 1 && <span className="mx-1 h-0.5 w-6 bg-gray" aria-hidden="true" />}
          </div>
        ))}
        {["Dismissed", "Referred"].includes(caseData.current_stage) && (
          <div className="ml-2 rounded-full bg-danger/10 px-4 py-1.5 text-xs font-semibold text-danger">
            {caseData.current_stage}
          </div>
        )}
      </div>

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Complaint">
          <dl className="space-y-2.5 text-sm">
            {[
              ["Complainant", caseData.complainant ? `${caseData.complainant.first_name} ${caseData.complainant.last_name}` : "—"],
              ["Respondent", caseData.respondent ? `${caseData.respondent.first_name} ${caseData.respondent.last_name}` : "—"],
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
          <div className="mt-4 grid grid-cols-2 gap-2">
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
              <div className="grid grid-cols-2 gap-2">
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
              { mediation_date: mediationDate, attendance, outcome: mediationOutcome, proceedings_notes: mediationNotes || undefined },
              () => setMediationOpen(false)
            );
          }}
          className="space-y-4"
        >
          <FormField label="Date" required>
            <input type="date" value={mediationDate} onChange={(e) => setMediationDate(e.target.value)} required className={inputClasses} />
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
                conciliation_date: conciliationDate,
                pangkat_members: pangkat.split(",").map((m) => m.trim()).filter(Boolean),
                outcome: conciliationOutcome,
              },
              () => setConciliationOpen(false)
            );
          }}
          className="space-y-4"
        >
          <FormField label="Date" required>
            <input type="date" value={conciliationDate} onChange={(e) => setConciliationDate(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Pangkat members" required hint="At least three, separated by commas">
            <input value={pangkat} onChange={(e) => setPangkat(e.target.value)} required className={inputClasses} placeholder="Member 1, Member 2, Member 3" />
          </FormField>
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
          <div className="grid grid-cols-2 gap-4">
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
