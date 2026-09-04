import { useEffect, useState, type FormEvent } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import StatusBadge from "../../components/UI/StatusBadge";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { Resident } from "../../types";
import { BLOTTER_ACTIONS, BLOTTER_TYPES, type Blotter } from "../../types/blotter";

/**
 * The barangay blotter — what was reported at the desk, and what was done.
 *
 * Most entries are "Recorded only": somebody wanted an incident on the
 * record and nothing more. That is what a blotter is for, so it is the
 * default rather than an unfinished state.
 *
 * The narrative can never be edited after filing. It is what was said on the
 * day, and a record that can be rewritten afterwards is worth nothing as
 * evidence — corrections go in the action notes, dated and attributable.
 */

/** Somebody named in the entry, as the intake form holds them. */
interface PersonDraft {
  role: "Subject" | "Witness";
  resident: Resident | null;
  name: string;
  contact: string;
}

const blankPerson = (role: PersonDraft["role"] = "Subject"): PersonDraft => ({
  role,
  resident: null,
  name: "",
  contact: "",
});

const dateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function BlotterList() {
  const [rows, setRows] = useState<Blotter[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Blotter | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  /* ---- intake ---- */
  const [incidentAt, setIncidentAt] = useState("");
  const [place, setPlace] = useState("");
  const [type, setType] = useState(BLOTTER_TYPES[0]);
  const [narrative, setNarrative] = useState("");
  const [reporterResident, setReporterResident] = useState<Resident | null>(null);
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [people, setPeople] = useState<PersonDraft[]>([blankPerson()]);
  const [action, setAction] = useState(BLOTTER_ACTIONS[0]);
  const [actionNotes, setActionNotes] = useState("");

  /* ---- the action recorded afterwards ---- */
  const [detailAction, setDetailAction] = useState(BLOTTER_ACTIONS[0]);
  const [detailNotes, setDetailNotes] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/blotters", {
        params: {
          page,
          search: search || undefined,
          status: statusFilter || undefined,
          incident_type: typeFilter || undefined,
        },
      })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, typeFilter]);

  useAutoRefresh(load, REFRESH.staff);

  const resetForm = () => {
    setIncidentAt("");
    setPlace("");
    setType(BLOTTER_TYPES[0]);
    setNarrative("");
    setReporterResident(null);
    setReporterName("");
    setReporterContact("");
    setPeople([blankPerson()]);
    setAction(BLOTTER_ACTIONS[0]);
    setActionNotes("");
    setFormError("");
  };

  const record = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Record this blotter entry?", confirmText: "Yes, record" })))
      return;

    setSaving(true);
    setFormError("");
    try {
      const response = await api.post("/blotters", {
        incident_at: incidentAt || undefined,
        place_of_incident: place,
        incident_type: type,
        narrative,
        reporter_id: reporterResident?.id,
        reporter_name: reporterResident ? undefined : reporterName || undefined,
        reporter_contact: reporterResident ? undefined : reporterContact || undefined,
        // Blank rows are how a form gets filled in — they are not people.
        people: people
          .filter((p) => p.resident || p.name.trim())
          .map((p) => ({
            role: p.role,
            resident_id: p.resident?.id,
            name: p.resident ? undefined : p.name,
            contact: p.resident ? undefined : p.contact || undefined,
          })),
        action_taken: action,
        action_notes: actionNotes || undefined,
      });
      setCreateOpen(false);
      resetForm();
      toast(response.data.message);
      load();
    } catch (err) {
      // The VAWC refusal arrives here, and it is the one message on this page
      // the clerk must actually read rather than dismiss.
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (entry: Blotter) => {
    try {
      const response = await api.get(`/blotters/${entry.id}`);
      const full: Blotter = response.data.data;
      setDetail(full);
      setDetailAction(full.action_taken);
      setDetailNotes(full.action_notes ?? "");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const saveAction = async (close: boolean) => {
    if (!detail) return;
    try {
      await api.put(`/blotters/${detail.id}`, {
        action_taken: detailAction,
        action_notes: detailNotes || undefined,
        status: close ? "Closed" : "Open",
      });
      setDetail(null);
      toast(close ? "Entry closed." : "Action recorded.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const setPerson = (index: number, changes: Partial<PersonDraft>) =>
    setPeople((prev) => prev.map((p, i) => (i === index ? { ...p, ...changes } : p)));

  return (
    <div>
      <PageHeader
        title="Blotter"
        subtitle="The desk's record of incidents reported at the barangay"
        actions={
          <button
            type="button"
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + New entry
          </button>
        }
      />

      <div className="mb-4 rounded-2xl border border-gray bg-white px-4 py-3 text-xs leading-relaxed text-gray-500">
        Most entries are <strong>recorded only</strong> — somebody wanted the incident on the
        record. Where it goes next is written as an <strong>action</strong>, so the entry stays
        readable as what was said on the day. Reports involving{" "}
        <strong>violence against women or children</strong> are not written here at all: they go to
        the VAWC Desk, which keeps confidential records and can issue a Barangay Protection Order.
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${inputClasses} max-w-xs flex-1`}
            placeholder="Search number, place, name, or what happened…"
            aria-label="Search the blotter"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-sm text-dark outline-none transition focus:border-primary"
          >
            <option value="">Status: All</option>
            <option>Open</option>
            <option>Closed</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by incident type"
            className="cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-sm text-dark outline-none transition focus:border-primary"
          >
            <option value="">Type: All</option>
            {BLOTTER_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

        <DataTable
          columns={[
            {
              header: "Blotter #",
              render: (b: Blotter) => (
                <button
                  type="button"
                  onClick={() => void openDetail(b)}
                  className="cursor-pointer font-medium text-primary hover:underline"
                >
                  {b.blotter_number}
                </button>
              ),
            },
            {
              header: "Incident",
              render: (b: Blotter) => (
                <span>
                  <span className="block font-medium text-dark">{b.incident_type}</span>
                  <span className="block text-xs text-gray-500">{b.place_of_incident}</span>
                </span>
              ),
            },
            { header: "When", render: (b: Blotter) => dateTime(b.incident_at ?? b.recorded_at) },
            { header: "Reported by", render: (b: Blotter) => b.reporter },
            { header: "Action", render: (b: Blotter) => b.action_taken },
            { header: "Status", render: (b: Blotter) => <StatusBadge status={b.status} /> },
          ]}
          rows={rows}
          rowKey={(b) => b.id}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No blotter entries yet."
        />
      </Card>

      {/* ---------- intake ---------- */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Blotter Entry" size="xl">
        {formError && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm leading-relaxed font-medium text-danger">
            {formError}
          </p>
        )}

        <form onSubmit={record} className="space-y-5">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="When did it happen?" hint="Leave blank if not known.">
              <input
                type="datetime-local"
                value={incidentAt}
                onChange={(e) => setIncidentAt(e.target.value)}
                max={new Date().toISOString().slice(0, 16)}
                className={inputClasses}
              />
            </FormField>
            <FormField label="Where?" required>
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                required
                className={inputClasses}
                placeholder="e.g. Purok 3, near the chapel"
              />
            </FormField>
            <FormField label="Type of incident" required>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputClasses}
              >
                {BLOTTER_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField
            label="What happened?"
            required
            hint="In the reporter's own words as far as possible. This cannot be edited after filing."
          >
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              required
              rows={4}
              className={`${inputClasses} resize-none`}
            />
          </FormField>

          <div className="rounded-xl border border-gray p-4">
            <p className="mb-3 text-sm font-medium text-dark">Who is reporting it?</p>
            <ResidentPicker value={reporterResident} onChange={setReporterResident} />
            {!reporterResident && (
              <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                {/* Anybody may report an incident to the barangay, on the
                    register or not — a passer-by often reports the accident. */}
                <FormField label="Or type their name" hint="For somebody not on the register.">
                  <input
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    className={inputClasses}
                  />
                </FormField>
                <FormField label="Contact">
                  <input
                    value={reporterContact}
                    onChange={(e) => setReporterContact(e.target.value)}
                    className={inputClasses}
                  />
                </FormField>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray p-4">
            <p className="mb-1 text-sm font-medium text-dark">Others named in the entry</p>
            <p className="mb-3 text-xs text-gray-400">
              The person complained of, and anybody who saw it. Leave blank if there is nobody.
            </p>

            <div className="space-y-3">
              {people.map((person, index) => (
                <div key={index} className="rounded-xl bg-secondary/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <select
                      value={person.role}
                      onChange={(e) =>
                        setPerson(index, { role: e.target.value as PersonDraft["role"] })
                      }
                      className="cursor-pointer rounded-full border border-gray bg-white px-3.5 py-1.5 text-xs font-semibold text-dark outline-none"
                    >
                      <option>Subject</option>
                      <option>Witness</option>
                    </select>
                    {people.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPeople((prev) => prev.filter((_, i) => i !== index))}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-gray bg-white px-3 py-1 text-xs font-semibold text-gray-500 transition-colors hover:border-danger hover:text-danger"
                      >
                        <FiX className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>

                  <ResidentPicker
                    value={person.resident}
                    onChange={(resident) => setPerson(index, { resident })}
                  />

                  {!person.resident && (
                    <div className="mt-2 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                      <input
                        value={person.name}
                        onChange={(e) => setPerson(index, { name: e.target.value })}
                        className={inputClasses}
                        placeholder="Or type a name"
                      />
                      <input
                        value={person.contact}
                        onChange={(e) => setPerson(index, { contact: e.target.value })}
                        className={inputClasses}
                        placeholder="Contact (optional)"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPeople((prev) => [...prev, blankPerson()])}
              className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray py-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <FiPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add another person
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <FormField label="What did the desk do?" required>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className={inputClasses}
              >
                {BLOTTER_ACTIONS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Notes on the action">
              <input
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className={inputClasses}
              />
            </FormField>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Recording…" : "Record entry"}
          </button>
        </form>
      </Modal>

      {/* ---------- one entry ---------- */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Blotter ${detail.blotter_number}` : "Blotter entry"}
        wide
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Incident</dt>
                <dd className="text-dark">
                  {detail.incident_type} · {detail.place_of_incident}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">When it happened</dt>
                <dd className="text-dark">{dateTime(detail.incident_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Reported by</dt>
                <dd className="text-dark">
                  {detail.reporter}
                  {detail.reporter_contact ? ` · ${detail.reporter_contact}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Written down</dt>
                <dd className="text-dark">
                  {dateTime(detail.recorded_at)}
                  {detail.recorded_by ? ` by ${detail.recorded_by}` : ""}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wide text-gray-400">
                What was reported
              </p>
              <p className="whitespace-pre-line rounded-xl bg-secondary/60 px-4 py-3 text-sm leading-relaxed text-dark">
                {detail.narrative}
              </p>
            </div>

            {(detail.people?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-gray-400">
                  Others named
                </p>
                <ul className="space-y-1.5">
                  {detail.people?.map((person) => (
                    <li
                      key={person.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray px-3.5 py-2 text-sm"
                    >
                      <span className="text-dark">{person.name}</span>
                      <span className="flex items-center gap-2 text-xs text-gray-500">
                        {person.contact}
                        <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-dark">
                          {person.role}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.lupon_case && (
              <p className="rounded-xl bg-primary/10 px-4 py-2.5 text-xs text-dark">
                Docketed with the Lupon as <strong>{detail.lupon_case.case_number}</strong> —{" "}
                {detail.lupon_case.stage}.
              </p>
            )}

            <div className="rounded-xl border border-gray p-4">
              <p className="mb-3 text-sm font-medium text-dark">Action taken</p>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <FormField label="What was done">
                  <select
                    value={detailAction}
                    onChange={(e) => setDetailAction(e.target.value)}
                    className={inputClasses}
                  >
                    {BLOTTER_ACTIONS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Notes" hint="Corrections and follow-ups go here — the entry itself does not change.">
                  <input
                    value={detailNotes}
                    onChange={(e) => setDetailNotes(e.target.value)}
                    className={inputClasses}
                  />
                </FormField>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveAction(false)}
                  className="flex-1 cursor-pointer rounded-full border border-gray bg-white py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                >
                  Save
                </button>
                {detail.status === "Open" && (
                  <button
                    type="button"
                    onClick={() => void saveAction(true)}
                    className="flex-1 cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                  >
                    Save &amp; close entry
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
