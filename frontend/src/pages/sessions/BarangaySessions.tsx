import { useEffect, useState, type FormEvent } from "react";
import { FiPlus, FiCheckCircle, FiEdit2, FiUsers } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import FormField from "../../components/UI/FormField";
import StatusBadge from "../../components/UI/StatusBadge";
import PeriodFilter, {
  ALL_TIME,
  periodParams,
  type Period,
} from "../../components/UI/PeriodFilter";

/**
 * The minutes of the Sangguniang Barangay.
 *
 * The one document a barangay secretary is personally answerable for, and
 * until now it lived outside this system entirely. Draft minutes are not a
 * record — the council adopts them at a later sitting — so the status is a
 * field the secretary sets and the adoption is a button only the Punong
 * Barangay has.
 */

interface Attendee {
  id?: number;
  name: string;
  position: string | null;
  attendance: "Present" | "Absent" | "Excused" | "Late";
  remarks: string | null;
}

interface Session {
  id: number;
  session_number: string;
  session_type: "Regular" | "Special";
  session_date: string;
  called_to_order_at: string | null;
  adjourned_at: string | null;
  venue: string;
  agenda: string | null;
  minutes: string | null;
  status: "Draft" | "For Approval" | "Adopted";
  adopted_at: string | null;
  attendees?: Attendee[];
  attendees_count?: number;
  present_count?: number;
  recorder?: { id: number; name: string } | null;
}

const ATTENDANCE = ["Present", "Late", "Excused", "Absent"] as const;

const input =
  "w-full rounded-xl border border-gray bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";

/** A blank sheet: the council, ready to be marked. */
const blankAttendee = (): Attendee => ({
  name: "",
  position: null,
  attendance: "Present",
  remarks: null,
});

const asDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** "14:30" out of whatever the API returns — a time column may arrive as "14:30:00". */
const asTime = (value: string | null) => (value ? value.slice(0, 5) : "");

export default function BarangaySessions() {
  const { user } = useAuth();
  /* Adoption is the council's act. The secretary writes; the PB adopts. */
  const canAdopt = user?.role === "Punong Barangay" || user?.role === "Admin";

  const [rows, setRows] = useState<Session[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [years, setYears] = useState<number[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [sessionType, setSessionType] = useState<"Regular" | "Special">("Regular");
  const [sessionDate, setSessionDate] = useState("");
  const [calledAt, setCalledAt] = useState("");
  const [adjournedAt, setAdjournedAt] = useState("");
  const [venue, setVenue] = useState("Barangay Hall");
  const [agenda, setAgenda] = useState("");
  const [minutes, setMinutes] = useState("");
  const [status, setStatus] = useState<"Draft" | "For Approval">("Draft");
  const [attendees, setAttendees] = useState<Attendee[]>([blankAttendee()]);

  const load = () => {
    setLoading(true);
    api
      .get("/sessions", { params: { page, ...periodParams(period) } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
        setWindowLabel(r.data.data.window?.label ?? null);
        setYears(r.data.data.years ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, period]);

  useAutoRefresh(load, REFRESH.staff);

  const changePeriod = (next: Period) => {
    setPeriod(next);
    setPage(1);
  };

  const startNew = () => {
    setEditing(null);
    setSessionType("Regular");
    setSessionDate("");
    setCalledAt("");
    setAdjournedAt("");
    setVenue("Barangay Hall");
    setAgenda("");
    setMinutes("");
    setStatus("Draft");
    setAttendees([blankAttendee()]);
    setError("");
    setOpen(true);
  };

  const startEdit = async (row: Session) => {
    /* The list carries counts, not the attendance sheet — fetched here so
       opening a session to read it does not cost every other row a join. */
    const full = (await api.get(`/sessions/${row.id}`)).data.data as Session;

    setEditing(full);
    setSessionType(full.session_type);
    setSessionDate(full.session_date.slice(0, 10));
    setCalledAt(asTime(full.called_to_order_at));
    setAdjournedAt(asTime(full.adjourned_at));
    setVenue(full.venue ?? "Barangay Hall");
    setAgenda(full.agenda ?? "");
    setMinutes(full.minutes ?? "");
    setStatus(full.status === "Adopted" ? "For Approval" : full.status);
    setAttendees(full.attendees?.length ? full.attendees : [blankAttendee()]);
    setError("");
    setOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      session_type: sessionType,
      session_date: sessionDate,
      called_to_order_at: calledAt || null,
      adjourned_at: adjournedAt || null,
      venue: venue || "Barangay Hall",
      agenda: agenda || null,
      minutes: minutes || null,
      status,
      /* Blank rows are somebody who started typing and stopped, not an
         official who was absent. */
      attendees: attendees.filter((a) => a.name.trim() !== ""),
    };

    try {
      if (editing) await api.put(`/sessions/${editing.id}`, payload);
      else await api.post("/sessions", payload);

      setOpen(false);
      load();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      setError(res?.data?.message ?? "The session could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const adopt = async (row: Session) => {
    try {
      await api.post(`/sessions/${row.id}/adopt`);
      load();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      window.alert(res?.data?.message ?? "The minutes could not be adopted.");
    }
  };

  const setAttendee = (i: number, patch: Partial<Attendee>) =>
    setAttendees((list) => list.map((a, n) => (n === i ? { ...a, ...patch } : a)));

  return (
    <div>
      <PageHeader
        title="Barangay Sessions"
        subtitle="Minutes and attendance for every sitting of the Sangguniang Barangay"
        actions={
          <button
            type="button"
            onClick={startNew}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> Record a session
          </button>
        }
      />

      <PeriodFilter
        value={period}
        onChange={changePeriod}
        years={years}
        showing={windowLabel}
        count={total}
        noun="session"
      />

      <Card>
        <DataTable
          columns={[
            {
              header: "Session",
              render: (s: Session) => (
                <div>
                  <p className="font-mono font-semibold text-primary">{s.session_number}</p>
                  <p className="text-xs text-gray-500">{s.session_type}</p>
                </div>
              ),
            },
            { header: "Date", render: (s: Session) => asDate(s.session_date) },
            {
              header: "Ran",
              render: (s: Session) =>
                s.called_to_order_at
                  ? `${asTime(s.called_to_order_at)}${s.adjourned_at ? ` – ${asTime(s.adjourned_at)}` : ""}`
                  : "—",
            },
            {
              header: "Attendance",
              render: (s: Session) =>
                s.attendees_count ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-dark">
                    <FiUsers className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    {/* Present or late — somebody who was in the room. */}
                    <span className="font-semibold">{s.present_count ?? 0}</span>
                    <span className="text-gray-400">of {s.attendees_count}</span>
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">Not taken</span>
                ),
            },
            { header: "Status", render: (s: Session) => <StatusBadge status={s.status} /> },
            {
              header: "",
              render: (s: Session) => (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray px-3 py-1.5 text-xs font-semibold text-dark transition hover:border-primary/50"
                  >
                    <FiEdit2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {s.status === "Adopted" ? "Read" : "Edit"}
                  </button>

                  {/* Only the council adopts, and only once. */}
                  {canAdopt && s.status !== "Adopted" && (
                    <button
                      type="button"
                      onClick={() => adopt(s)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark"
                    >
                      <FiCheckCircle className="h-3.5 w-3.5" aria-hidden="true" /> Adopt
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(s) => s.id}
          loading={loading}
          page={page}
          lastPage={lastPage}
          total={total}
          onPageChange={setPage}
          numbered
          emptyMessage="No sessions recorded yet."
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Session ${editing.session_number}` : "Record a session"}
        size="wide"
      >
        <form onSubmit={save} className="space-y-5 p-5">
          {editing?.status === "Adopted" && (
            <div className="rounded-xl border border-gray bg-secondary px-4 py-3 text-sm text-gray-600">
              These minutes were adopted{editing.adopted_at ? ` on ${asDate(editing.adopted_at)}` : ""}.
              They are the barangay&apos;s record now and can no longer be edited.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Kind of session" required>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as "Regular" | "Special")}
                className={input}
              >
                <option value="Regular">Regular</option>
                <option value="Special">Special</option>
              </select>
            </FormField>

            <FormField label="Date held" required>
              <input
                type="date"
                required
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                /* Minutes record something that happened. */
                max={new Date().toISOString().slice(0, 10)}
                className={input}
              />
            </FormField>

            <FormField label="Called to order" hint="The time the presiding officer opened it">
              <input
                type="time"
                value={calledAt}
                onChange={(e) => setCalledAt(e.target.value)}
                className={input}
              />
            </FormField>

            <FormField label="Adjourned">
              <input
                type="time"
                value={adjournedAt}
                onChange={(e) => setAdjournedAt(e.target.value)}
                className={input}
              />
            </FormField>

            <FormField label="Venue">
              <input value={venue} onChange={(e) => setVenue(e.target.value)} className={input} />
            </FormField>

            <FormField label="Status" hint="Adoption is the council's, not the secretary's">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "Draft" | "For Approval")}
                className={input}
              >
                <option value="Draft">Draft — still being written</option>
                <option value="For Approval">For approval — ready for the council</option>
              </select>
            </FormField>
          </div>

          <FormField label="Agenda">
            <textarea
              rows={3}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              className={input}
              placeholder="What the session was called to take up"
            />
          </FormField>

          <FormField label="Minutes">
            <textarea
              rows={10}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={input}
              placeholder="What was said, moved, seconded and carried"
            />
          </FormField>

          {/*
            Attendance per official, not a paragraph.
            The question asked of this record is "was this kagawad present",
            and a name buried in a sentence cannot answer it.
          */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-dark">Attendance</span>
              <button
                type="button"
                onClick={() => setAttendees((l) => [...l, blankAttendee()])}
                className="cursor-pointer text-xs font-semibold text-primary hover:underline"
              >
                + Add an official
              </button>
            </div>

            <div className="space-y-2">
              {attendees.map((a, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto_auto]">
                  <input
                    value={a.name}
                    onChange={(e) => setAttendee(i, { name: e.target.value })}
                    placeholder="Name"
                    className={input}
                  />
                  <input
                    value={a.position ?? ""}
                    onChange={(e) => setAttendee(i, { position: e.target.value })}
                    placeholder="Position"
                    className={input}
                  />
                  <select
                    value={a.attendance}
                    onChange={(e) =>
                      setAttendee(i, { attendance: e.target.value as Attendee["attendance"] })
                    }
                    className={input}
                  >
                    {ATTENDANCE.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAttendees((l) => l.filter((_, n) => n !== i))}
                    aria-label={`Remove ${a.name || "this row"}`}
                    className="cursor-pointer rounded-xl border border-gray px-3 text-sm text-gray-500 transition hover:border-danger/50 hover:text-danger"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition hover:border-primary/50"
            >
              Close
            </button>
            {editing?.status !== "Adopted" && (
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {saving ? "Saving…" : editing ? "Save the minutes" : "Record the session"}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
