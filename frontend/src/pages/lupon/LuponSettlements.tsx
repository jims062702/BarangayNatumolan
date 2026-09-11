import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiCheckCircle, FiClock, FiEdit2, FiFileText } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
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
import type { LuponSettlement } from "../../types";
import RevealGroup from "../../components/UI/RevealGroup";

const STATUSES = [
  "Within Repudiation Period",
  "Final",
  "Repudiated",
  "Complied",
  "Not Complied",
  "Executed",
];

const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

/** Days until `date`; negative means already past. */
const daysUntil = (date?: string | null) => {
  if (!date) return null;
  const diff = new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
};

function Deadline({ date, active }: { date?: string | null; active: boolean }) {
  const days = daysUntil(date);
  if (days === null) return <span className="text-gray-400">—</span>;
  if (!active) return <span className="text-gray-500">{asDate(date)}</span>;
  if (days < 0)
    return (
      <span className="font-semibold text-danger">
        {asDate(date)} · {Math.abs(days)}d overdue
      </span>
    );
  if (days === 0) return <span className="font-semibold text-warning">{asDate(date)} · today</span>;
  return (
    <span className="text-dark">
      {asDate(date)} · <span className="text-gray-500">{days}d left</span>
    </span>
  );
}

/**
 * Which compliance/execution actions the current status allows. Mirrors the
 * state machine in LuponController::applySettlementAction.
 */
const actionsFor = (s: LuponSettlement): { action: string; label: string; tone: string }[] => {
  const out: { action: string; label: string; tone: string }[] = [];

  if (s.status === "Within Repudiation Period") {
    out.push({ action: "finalize", label: "Finalize", tone: "success" });
    out.push({ action: "repudiate", label: "Repudiate", tone: "danger" });
  }
  if (["Final", "Not Complied"].includes(s.status)) {
    out.push({ action: "mark_complied", label: "Complied", tone: "success" });
    out.push({ action: "mark_not_complied", label: "Not complied", tone: "danger" });
    out.push({ action: "execute", label: "Execute", tone: "primary" });
  }
  if (!s.cfa_issued) out.push({ action: "issue_cfa", label: "Issue CFA", tone: "muted" });
  if (!s.cba_issued) out.push({ action: "issue_cba", label: "Issue CBA", tone: "muted" });

  return out;
};

/** What each action does, shown on hover and spelled out under the buttons. */
const ACTION_HELP: Record<string, string> = {
  finalize: "End the repudiation window early — the settlement becomes binding.",
  repudiate:
    "A party rejected the settlement within 10 days for fraud, violence or intimidation. The case returns to conciliation.",
  mark_complied: "The obligations were carried out. Closes the settlement.",
  mark_not_complied: "The deadline passed without compliance. Execution becomes available.",
  execute:
    "Enforce the settlement. Within 6 months the Lupon may execute it; after that it takes a court action.",
  issue_cfa:
    "Certificate to File Action — conciliation was tried and failed, so the complainant MAY now go to court. Without it a court will dismiss the case.",
  issue_cba:
    "Certificate to Bar Action — the complainant failed to appear without justifiable cause, so they may NOT bring this dispute to court.",
};

const TONES: Record<string, string> = {
  success: "bg-success text-white hover:opacity-90",
  danger: "border border-danger/40 text-danger hover:bg-danger hover:text-white",
  primary: "border border-primary/40 text-primary hover:bg-primary hover:text-white",
  muted: "border border-gray text-gray-500 hover:border-primary hover:text-primary",
};

export default function LuponSettlements() {
  const [rows, setRows] = useState<LuponSettlement[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);

  const [viewing, setViewing] = useState<LuponSettlement | null>(null);
  const [notes, setNotes] = useState("");
  const [deadline, setDeadline] = useState("");

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
      .get("/lupon/settlements", { params: { page, due: dueOnly ? 1 : undefined } })
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
  }, [page, dueOnly]);

  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("lupon_cases", () => load(true));

  const open = (settlement: LuponSettlement) => {
    setViewing(settlement);
    setNotes(settlement.compliance_notes ?? "");
    setDeadline(settlement.compliance_deadline?.slice(0, 10) ?? "");
  };

  const run = async (settlement: LuponSettlement, action: string, label: string) => {
    if (
      !(await confirmAction({
        title: `${label} — ${settlement.lupon_case?.case_number ?? "settlement"}?`,
        confirmText: `Yes, ${label.toLowerCase()}`,
        danger: ["repudiate", "mark_not_complied"].includes(action),
      }))
    )
      return;
    try {
      const response = await api.post(`/lupon/settlements/${settlement.id}/action`, {
        action,
        notes: notes || null,
        compliance_deadline: deadline || null,
      });
      setViewing(null);
      toast(response.data.message);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const saveDeadline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!viewing) return;
    try {
      // No `action` — this records the terms only and never advances the
      // status, so a settlement still inside its repudiation window stays there.
      await api.post(`/lupon/settlements/${viewing.id}/action`, {
        notes: notes || null,
        compliance_deadline: deadline || null,
      });
      setViewing(null);
      toast("Compliance terms updated.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const inWindow = rows.filter((s) => s.status === "Within Repudiation Period").length;
  const overdue = rows.filter(
    (s) =>
      ["Final", "Not Complied"].includes(s.status) &&
      s.compliance_deadline &&
      (daysUntil(s.compliance_deadline) ?? 0) < 0
  ).length;
  const complied = rows.filter((s) => ["Complied", "Executed"].includes(s.status)).length;
  const certificates = rows.filter((s) => s.cfa_issued || s.cba_issued).length;

  return (
    <div>
      <PageHeader
        title="Settlement, Compliance & Execution"
        subtitle="Repudiation windows, compliance deadlines, execution and KP certificates"
      />

      <div className="mb-4 rounded-2xl border border-gray bg-secondary px-4 py-3 text-xs text-gray-500">
        An amicable settlement becomes final once the ten-day repudiation
        period lapses without a proper repudiation. Lapsed windows are
        finalized automatically when this register is opened.
      </div>

      <RevealGroup className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="In repudiation window" value={inWindow} icon={FiClock} tone="warning" />
        <StatTile label="Compliance overdue" value={overdue} icon={FiAlertTriangle} tone="danger" />
        <StatTile label="Complied / executed" value={complied} icon={FiCheckCircle} tone="success" />
        <StatTile label="CFA / CBA issued" value={certificates} icon={FiFileText} />
      </RevealGroup>

      <Card>
        <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-dark">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(e) => {
              setPage(1);
              setDueOnly(e.target.checked);
            }}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
          Show only obligations past their compliance deadline
        </label>

        <DataTable
          columns={[
            {
              header: "Case No.",
              render: (s: LuponSettlement) =>
                s.lupon_case ? (
                  <Link
                    to={`/lupon/cases/${s.lupon_case.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {s.lupon_case.case_number}
                  </Link>
                ) : (
                  "—"
                ),
            },
            {
              header: "Parties",
              render: (s: LuponSettlement) => (
                <div className="min-w-0 text-xs">
                  <p className="truncate text-dark">
                    <span className="text-gray-400">Complainant:</span>{" "}
                    {s.lupon_case?.complainant_display_name ?? "—"}
                    {s.lupon_case?.complainant_is_resident === false && (
                      <span className="ml-1 rounded-full bg-gray px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                        non-resident
                      </span>
                    )}
                  </p>
                  <p className="truncate text-dark">
                    <span className="text-gray-400">Respondent:</span>{" "}
                    {s.lupon_case?.respondent_display_names || "—"}
                  </p>
                </div>
              ),
            },
            { header: "Type", render: (s: LuponSettlement) => s.settlement_type },
            { header: "Agreed", render: (s: LuponSettlement) => asDate(s.date_agreed) },
            {
              header: "Repudiation deadline",
              render: (s: LuponSettlement) => (
                <Deadline
                  date={s.repudiation_deadline}
                  active={s.status === "Within Repudiation Period"}
                />
              ),
            },
            {
              header: "Compliance due",
              render: (s: LuponSettlement) => (
                <Deadline
                  date={s.compliance_deadline}
                  active={["Final", "Not Complied"].includes(s.status)}
                />
              ),
            },
            {
              header: "Certificates",
              render: (s: LuponSettlement) => {
                const issued = [
                  s.cfa_issued && { code: "CFA", title: "Certificate to File Action — may proceed to court" },
                  s.cba_issued && { code: "CBA", title: "Certificate to Bar Action — barred from court" },
                ].filter(Boolean) as { code: string; title: string }[];

                return issued.length ? (
                  <span className="text-xs font-semibold text-primary">
                    {issued.map((c, i) => (
                      <span key={c.code} title={c.title} className="cursor-help">
                        {i > 0 && " · "}
                        {c.code}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                );
              },
            },
            { header: "Status", render: (s: LuponSettlement) => <StatusBadge status={s.status} /> },
            {
              header: "Actions",
              render: (s: LuponSettlement) => (
                <RowActions>
                  <RowAction label="Manage settlement" icon={FiEdit2} onClick={() => open(s)} />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(s) => s.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by case number, party, title or terms…"
          getSearchText={(s) =>
            `${s.lupon_case?.case_number ?? ""} ${s.lupon_case?.case_title ?? ""} ${
              s.lupon_case?.complainant_display_name ?? ""
            } ${s.lupon_case?.respondent_display_names ?? ""} ${s.settlement_type} ${s.terms}`
          }
          filters={[
            { label: "Status", getValue: (s) => s.status, options: STATUSES },
            { label: "Type", getValue: (s) => s.settlement_type },
          ]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No settlements recorded yet."
        />
      </Card>

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        wide
        title={`Settlement — ${viewing?.lupon_case?.case_number ?? ""}`}
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-dark">{viewing.lupon_case?.case_title}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {viewing.settlement_type} · agreed {asDate(viewing.date_agreed)} ·{" "}
                <StatusBadge status={viewing.status} />
              </p>
            </div>

            {/* Who filed this, and against whom. */}
            <dl className="grid gap-3 rounded-xl border border-gray px-4 py-3 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-gray-400">Complainant</dt>
                <dd className="text-dark">
                  {viewing.lupon_case?.complainant_display_name ?? "—"}
                  {viewing.lupon_case?.complainant_is_resident === false && (
                    <span className="ml-2 rounded-full bg-gray px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                      not a barangay resident
                    </span>
                  )}
                </dd>
                {viewing.lupon_case?.complainant_is_resident === false && (
                  <dd className="mt-0.5 text-xs text-gray-500">
                    {viewing.lupon_case?.complainant_address ?? "Address not recorded"}
                    {viewing.lupon_case?.complainant_contact
                      ? ` · ${viewing.lupon_case.complainant_contact}`
                      : ""}
                  </dd>
                )}
              </div>
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-gray-400">Respondent(s)</dt>
                <dd className="text-dark">
                  {viewing.lupon_case?.respondent_display_names || "—"}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                Terms and obligations
              </p>
              <p className="whitespace-pre-wrap rounded-xl border border-gray px-4 py-3 text-dark">
                {viewing.terms}
              </p>
            </div>

            <dl className="grid gap-3 rounded-xl bg-secondary px-4 py-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Repudiation</dt>
                <dd>
                  <Deadline
                    date={viewing.repudiation_deadline}
                    active={viewing.status === "Within Repudiation Period"}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Certificates</dt>
                <dd className="text-dark">
                  {viewing.cfa_issued ? `CFA ${asDate(viewing.cfa_issued_at)}` : "No CFA"} ·{" "}
                  {viewing.cba_issued ? `CBA ${asDate(viewing.cba_issued_at)}` : "No CBA"}
                </dd>
              </div>
            </dl>

            <form onSubmit={saveDeadline} className="grid gap-4 rounded-xl border border-gray p-4 sm:grid-cols-2">
              <FormField label="Compliance deadline" hint="When the obligations fall due.">
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputClasses}
                />
              </FormField>
              <FormField label="Compliance notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={`${inputClasses} resize-none`}
                />
              </FormField>
              <button
                type="submit"
                className="w-full cursor-pointer rounded-full border border-primary/40 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white sm:col-span-2"
              >
                Save deadline &amp; notes
              </button>
            </form>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Actions</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {actionsFor(viewing).map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    title={ACTION_HELP[a.action]}
                    onClick={() => run(viewing, a.action, a.label)}
                    className={`cursor-pointer rounded-full py-2 text-xs font-semibold transition-colors ${TONES[a.tone]}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {actionsFor(viewing).length === 0 && (
                <p className="py-3 text-center text-xs text-gray-400">
                  This settlement is closed — no further action available.
                </p>
              )}

            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
