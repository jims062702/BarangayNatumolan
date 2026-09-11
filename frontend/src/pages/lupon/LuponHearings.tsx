import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle, FiCalendar, FiCheckCircle, FiCheckSquare,
  FiFileText, FiMail, FiRotateCcw, FiSend,
} from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { formatWallClock } from "../../lib/datetime";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatTile from "../../components/UI/StatTile";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { KpFormPayload, LuponHearing } from "../../types";

const HEARING_TYPES = ["Mediation", "Conciliation", "Arbitration"];
const OUTCOME_STATUSES = ["Completed", "Rescheduled", "Cancelled", "No Show"];

const today = () => new Date().toISOString().slice(0, 10);
const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

/** Scheduled, summons issued, but no proof of service on file. */
const unserved = (h: LuponHearing) =>
  h.status === "Scheduled" && !h.summons_served_date;

type View = "today" | "upcoming" | "past";

export default function LuponHearings() {
  // Today is the working view — the desk needs the day it is running.
  const [view, setView] = useState<View>("today");
  const [rows, setRows] = useState<LuponHearing[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Summons / proof of service
  const [summonsFor, setSummonsFor] = useState<LuponHearing | null>(null);
  const [issued, setIssued] = useState(true);
  const [servedDate, setServedDate] = useState("");

  // Outcome + attendance
  const [outcomeFor, setOutcomeFor] = useState<LuponHearing | null>(null);
  const [status, setStatus] = useState("Completed");
  const [complainantPresent, setComplainantPresent] = useState(true);
  const [respondentPresent, setRespondentPresent] = useState(true);
  const [proceedings, setProceedings] = useState("");
  const [outcome, setOutcome] = useState("");

  // Reschedule
  const [resetFor, setResetFor] = useState<LuponHearing | null>(null);
  const [newDateTime, setNewDateTime] = useState("");
  const [reason, setReason] = useState("");

  // KP forms
  const [formsFor, setFormsFor] = useState<LuponHearing | null>(null);
  const [forms, setForms] = useState<KpFormPayload | null>(null);

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
      .get("/lupon/hearings", { params: { page, when: view } })
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
  }, [page, view]);

  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("lupon_cases", () => load(true));

  const openSummons = (hearing: LuponHearing) => {
    setSummonsFor(hearing);
    setIssued(hearing.summons_issued);
    setServedDate(hearing.summons_served_date?.slice(0, 10) ?? "");
  };

  const saveSummons = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!summonsFor) return;
    try {
      await api.post(`/lupon/hearings/${summonsFor.id}/summons`, {
        summons_issued: issued,
        summons_served_date: servedDate || null,
      });
      setSummonsFor(null);
      toast("Summons record updated.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const openOutcome = (hearing: LuponHearing) => {
    setOutcomeFor(hearing);
    setStatus("Completed");
    setComplainantPresent(hearing.complainant_present ?? true);
    setRespondentPresent(hearing.respondent_present ?? true);
    setProceedings(hearing.proceedings_notes ?? "");
    setOutcome(hearing.outcome ?? "");
  };

  const saveOutcome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!outcomeFor) return;
    if (!(await confirmAction({ title: "Record this hearing outcome?", confirmText: "Yes, record" }))) return;
    try {
      await api.put(`/lupon/hearings/${outcomeFor.id}`, {
        status,
        complainant_present: complainantPresent,
        respondent_present: respondentPresent,
        proceedings_notes: proceedings || null,
        outcome: outcome || null,
      });
      setOutcomeFor(null);
      toast("Hearing outcome recorded.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const openReset = (hearing: LuponHearing) => {
    setResetFor(hearing);
    setNewDateTime("");
    setReason("");
  };

  const saveReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetFor) return;
    if (
      !(await confirmAction({
        title: "Reset this hearing?",
        text: "Both parties will be notified of the new date.",
        confirmText: "Yes, reschedule",
      }))
    )
      return;
    try {
      await api.post(`/lupon/hearings/${resetFor.id}/reschedule`, {
        scheduled_at: newDateTime.replace("T", " ") + ":00",
        reason: reason || null,
      });
      setResetFor(null);
      toast("Hearing rescheduled — both parties were notified.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const openForms = async (hearing: LuponHearing) => {
    setFormsFor(hearing);
    setForms(null);
    try {
      const response = await api.get(`/lupon/cases/${hearing.lupon_case?.id}/forms`);
      setForms(response.data.data);
    } catch (err) {
      toast(errorMessage(err), "error");
      setFormsFor(null);
    }
  };

  const scheduled = rows.filter((h) => h.status === "Scheduled").length;
  const awaitingService = rows.filter(unserved).length;
  const noShows = rows.filter((h) => h.status === "No Show").length;
  const completed = rows.filter((h) => h.status === "Completed").length;

  return (
    <div>
      <PageHeader
        title="Hearing Calendar, Summons & KP Forms"
        subtitle="Schedules across the whole docket — summons, proof of service, attendance and prescribed forms"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Scheduled" value={scheduled} icon={FiCalendar} />
        <StatTile
          label="Awaiting service"
          value={awaitingService}
          icon={FiMail}
          tone="warning"
          hint="Summons with no proof of service"
        />
        <StatTile label="No-shows" value={noShows} icon={FiAlertCircle} tone="danger" />
        <StatTile label="Completed" value={completed} icon={FiCheckCircle} tone="success" />
      </div>

      {/* Wraps on a phone: three pill tabs in a row need ~360px. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["today", "Today's hearings"],
            ["upcoming", "Upcoming hearings"],
            ["past", "Past hearings"],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setPage(1);
              setView(key);
            }}
            className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              view === key
                ? "bg-primary text-white"
                : "border border-gray bg-white text-dark hover:border-primary hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <DataTable
          columns={[
            {
              header: "Case No.",
              render: (h: LuponHearing) =>
                h.lupon_case ? (
                  <Link
                    to={`/lupon/cases/${h.lupon_case.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {h.lupon_case.case_number}
                  </Link>
                ) : (
                  "—"
                ),
            },
            {
              header: "Title",
              render: (h: LuponHearing) => (
                <span className="block max-w-xs truncate" title={h.lupon_case?.case_title}>
                  {h.lupon_case?.case_title ?? "—"}
                </span>
              ),
            },
            {
              header: "Parties",
              render: (h: LuponHearing) => (
                <span className="block max-w-xs truncate text-xs text-gray-500">
                  {h.lupon_case?.complainant_display_name ?? "—"}
                  {h.lupon_case?.complainant_is_resident === false && " (non-resident)"} vs{" "}
                  {h.lupon_case?.respondent_display_names || "—"}
                </span>
              ),
            },
            { header: "Type", render: (h: LuponHearing) => h.hearing_type },
            { header: "Schedule", render: (h: LuponHearing) => formatWallClock(h.scheduled_at) },
            {
              header: "Summons",
              render: (h: LuponHearing) => {
                if (!h.summons_issued) {
                  return <span className="text-xs text-gray-400">Not issued</span>;
                }
                return h.summons_served_date ? (
                  <span className="text-xs text-success">Served {asDate(h.summons_served_date)}</span>
                ) : (
                  <span className="text-xs font-semibold text-warning">Awaiting service</span>
                );
              },
            },
            {
              header: "Attendance",
              render: (h: LuponHearing) =>
                h.complainant_present === null || h.complainant_present === undefined ? (
                  "—"
                ) : (
                  <span className="text-xs text-gray-500">
                    C: {h.complainant_present ? "Present" : "Absent"} · R:{" "}
                    {h.respondent_present ? "Present" : "Absent"}
                  </span>
                ),
            },
            { header: "Status", render: (h: LuponHearing) => <StatusBadge status={h.status} /> },
            {
              header: "Actions",
              render: (h: LuponHearing) => (
                <RowActions>
                  {h.status === "Scheduled" && (
                    <>
                      <RowAction
                        label="Record summons"
                        icon={FiSend}
                        onClick={() => openSummons(h)}
                      />
                      <RowAction
                        label="Record the outcome"
                        icon={FiCheckSquare}
                        tone="primary"
                        onClick={() => openOutcome(h)}
                      />
                      <RowAction
                        label="Reschedule"
                        icon={FiRotateCcw}
                        onClick={() => openReset(h)}
                      />
                    </>
                  )}
                  <RowAction label="KP forms" icon={FiFileText} onClick={() => openForms(h)} />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(h) => h.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by case number, title or type…"
          getSearchText={(h) =>
            `${h.lupon_case?.case_number ?? ""} ${h.lupon_case?.case_title ?? ""} ${
              h.lupon_case?.complainant_display_name ?? ""
            } ${h.lupon_case?.respondent_display_names ?? ""} ${h.hearing_type} ${h.status}`
          }
          filters={[
            { label: "Type", getValue: (h) => h.hearing_type, options: HEARING_TYPES },
            { label: "Status", getValue: (h) => h.status },
          ]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage={
            view === "today"
              ? "No hearings set for today."
              : view === "upcoming"
                ? "No upcoming hearings scheduled."
                : "No past hearings on record."
          }
        />
      </Card>

      {/* Summons & proof of service */}
      <Modal
        open={summonsFor !== null}
        onClose={() => setSummonsFor(null)}
        title={`Summons — ${summonsFor?.lupon_case?.case_number ?? ""}`}
      >
        <form onSubmit={saveSummons} className="space-y-4">
          <div className="rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
            {summonsFor?.hearing_type} hearing on {formatWallClock(summonsFor?.scheduled_at)}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
            <input
              type="checkbox"
              checked={issued}
              onChange={(e) => setIssued(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            Summons issued to both parties
          </label>
          <FormField
            label="Proof of service date"
            hint="The date the summons was actually served. Required before a party may be defaulted."
          >
            <input
              type="date"
              value={servedDate}
              max={today()}
              disabled={!issued}
              onChange={(e) => setServedDate(e.target.value)}
              className={inputClasses}
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Save summons record
          </button>
        </form>
      </Modal>

      {/* Attendance + outcome */}
      <Modal
        open={outcomeFor !== null}
        onClose={() => setOutcomeFor(null)}
        title={`Hearing outcome — ${outcomeFor?.lupon_case?.case_number ?? ""}`}
      >
        <form onSubmit={saveOutcome} className="space-y-4">
          <FormField label="Result" required>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClasses}>
              {OUTCOME_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-2 rounded-xl bg-secondary px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Attendance</p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
              <input
                type="checkbox"
                checked={complainantPresent}
                onChange={(e) => setComplainantPresent(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              Complainant present
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
              <input
                type="checkbox"
                checked={respondentPresent}
                onChange={(e) => setRespondentPresent(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              Respondent present
            </label>
          </div>
          <FormField label="Proceedings notes">
            <textarea
              value={proceedings}
              onChange={(e) => setProceedings(e.target.value)}
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <FormField label="Outcome">
            <input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className={inputClasses}
              placeholder="e.g. Settlement reached, No settlement"
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Record outcome
          </button>
        </form>
      </Modal>

      {/* Reschedule */}
      <Modal
        open={resetFor !== null}
        onClose={() => setResetFor(null)}
        title={`Reschedule — ${resetFor?.lupon_case?.case_number ?? ""}`}
      >
        <form onSubmit={saveReset} className="space-y-4">
          <div className="rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
            Currently set for {formatWallClock(resetFor?.scheduled_at)}. The original
            entry stays on the record marked <em>Rescheduled</em>.
          </div>
          <FormField label="New schedule" required>
            <input
              type="datetime-local"
              value={newDateTime}
              onChange={(e) => setNewDateTime(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>
          <FormField label="Reason">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClasses}
              placeholder="e.g. Respondent requested a new date"
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Reschedule &amp; notify parties
          </button>
        </form>
      </Modal>

      {/* Prescribed KP forms */}
      <Modal
        open={formsFor !== null}
        onClose={() => setFormsFor(null)}
        wide
        title={`KP Forms — ${formsFor?.lupon_case?.case_number ?? ""}`}
      >
        {!forms ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading case facts…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary px-4 py-3 text-sm">
              <p className="font-semibold text-dark">{forms.case.case_title}</p>
              <p className="mt-1 text-xs text-gray-500">
                {forms.barangay.name}, {forms.barangay.municipality},{" "}
                {forms.barangay.province} · Filed {asDate(forms.case.date_filed)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {forms.case.complainant_display_name ?? "—"}{" "}
                vs.{" "}
                {forms.case.respondent_display_names || "—"}
              </p>
            </div>

            <ul className="divide-y divide-gray/70">
              {forms.forms.map((form) => (
                <li key={form.code} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dark">
                      <span className="font-mono text-primary">{form.code}</span> — {form.name}
                    </p>
                    {!form.available && (
                      <p className="mt-0.5 text-xs text-gray-400">Needs {form.requires}.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!form.available}
                    onClick={() => window.print()}
                    className="shrink-0 cursor-pointer rounded-full border border-primary/40 px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:border-gray disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    Print
                  </button>
                </li>
              ))}
            </ul>

            <p className="rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
              Forms follow the DILG Katarungang Pambarangay handbook. A form
              becomes printable once the case holds the facts it requires.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
