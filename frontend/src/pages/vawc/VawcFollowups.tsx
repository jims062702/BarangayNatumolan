import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiCheckCircle, FiClock, FiShield } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import { FiEye } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatTile from "../../components/UI/StatTile";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import type { VawcFollowup } from "../../types";
import RevealGroup from "../../components/UI/RevealGroup";

const SAFETY_STATUSES = ["Safe", "At Risk", "Critical", "Unknown"];
const BPO_STATES = ["Compliant", "Violated", "No BPO"];

const today = () => new Date().toISOString().slice(0, 10);
const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

const isOverdue = (f: VawcFollowup) =>
  !!f.next_followup_date &&
  new Date(f.next_followup_date) <= new Date(today()) &&
  f.vawc_case?.status === "Active";

export default function VawcFollowups() {
  const [rows, setRows] = useState<VawcFollowup[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);
  const [viewing, setViewing] = useState<VawcFollowup | null>(null);

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
      .get("/vawc/followups", { params: { page, due: dueOnly ? 1 : undefined } })
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
  usePulse("vawc_cases", () => load(true));

  // Counted over the loaded page — the tiles summarise what is on screen.
  const atRisk = rows.filter((f) => ["At Risk", "Critical"].includes(f.safety_status)).length;
  const violated = rows.filter((f) => f.bpo_compliance === "Violated").length;
  const overdue = rows.filter(isOverdue).length;
  const closures = rows.filter((f) => f.closure_recommended).length;

  return (
    <div>
      <PageHeader
        title="Case Follow-Up & Intervention Monitoring"
        subtitle="Safety status, BPO compliance, referral attendance and closure recommendations"
      />

      <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-dark">
        <strong>Reminder:</strong> a <em>Critical</em> safety status or a
        violated protection order needs immediate coordination with the PNP
        Women and Children Protection Desk — never the Lupon.
      </div>

      <RevealGroup className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="At risk / critical" value={atRisk} icon={FiAlertTriangle} tone="danger" />
        <StatTile label="BPO violations" value={violated} icon={FiShield} tone="danger" />
        <StatTile label="Follow-ups due" value={overdue} icon={FiClock} tone="warning" />
        <StatTile
          label="Closure recommended"
          value={closures}
          icon={FiCheckCircle}
          tone="success"
        />
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
          Show only visits whose next check-in is due on an open case
        </label>

        <DataTable
          columns={[
            {
              header: "Case Code",
              render: (f: VawcFollowup) =>
                f.vawc_case ? (
                  <Link
                    to={`/vawc/cases/${f.vawc_case.id}`}
                    className="font-mono font-semibold text-primary hover:underline"
                  >
                    {f.vawc_case.case_code}
                  </Link>
                ) : (
                  "—"
                ),
            },
            { header: "Visit", render: (f: VawcFollowup) => f.followup_type },
            { header: "Date", render: (f: VawcFollowup) => asDate(f.followup_date) },
            {
              header: "Safety",
              render: (f: VawcFollowup) => <StatusBadge status={f.safety_status} />,
            },
            {
              header: "BPO",
              render: (f: VawcFollowup) => (
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                    f.bpo_compliance === "Violated"
                      ? "bg-danger/10 text-danger"
                      : f.bpo_compliance === "Compliant"
                        ? "bg-success/10 text-success"
                        : "bg-gray text-gray-500"
                  }`}
                >
                  {f.bpo_compliance}
                </span>
              ),
            },
            {
              header: "Referral attended",
              render: (f: VawcFollowup) =>
                f.referral_attended === null || f.referral_attended === undefined
                  ? "—"
                  : f.referral_attended
                    ? "Yes"
                    : "No",
            },
            {
              header: "Next check-in",
              render: (f: VawcFollowup) =>
                f.next_followup_date ? (
                  <span className={isOverdue(f) ? "font-semibold text-danger" : ""}>
                    {asDate(f.next_followup_date)}
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              header: "Actions",
              render: (f: VawcFollowup) => (
                <RowActions>
                  <RowAction label="View follow-up" icon={FiEye} onClick={() => setViewing(f)} />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(f) => f.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by case code or visit type…"
          getSearchText={(f) =>
            `${f.vawc_case?.case_code ?? ""} ${f.followup_type} ${f.safety_status} ${f.bpo_compliance}`
          }
          filters={[
            { label: "Safety", getValue: (f) => f.safety_status, options: SAFETY_STATUSES },
            { label: "BPO", getValue: (f) => f.bpo_compliance, options: BPO_STATES },
          ]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No follow-up visits recorded yet."
        />
      </Card>

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={`Follow-up — ${viewing?.vawc_case?.case_code ?? ""}`}
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 rounded-xl bg-secondary px-4 py-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Visit</dt>
                <dd className="text-dark">
                  {viewing.followup_type} · {asDate(viewing.followup_date)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Safety status</dt>
                <dd>
                  <StatusBadge status={viewing.safety_status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">BPO compliance</dt>
                <dd className="text-dark">{viewing.bpo_compliance}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Recorded by</dt>
                <dd className="text-dark">{viewing.recorder?.name ?? "—"}</dd>
              </div>
            </dl>
            {viewing.services_received && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                  Services received
                </p>
                <p className="rounded-xl border border-gray px-4 py-3 text-dark">
                  {viewing.services_received}
                </p>
              </div>
            )}
            {viewing.notes && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                  Confidential notes
                </p>
                <p className="whitespace-pre-wrap rounded-xl border border-gray px-4 py-3 text-dark">
                  {viewing.notes}
                </p>
              </div>
            )}
            {viewing.closure_recommended && (
              <p className="rounded-xl bg-success/10 px-4 py-2.5 text-xs font-semibold text-success">
                Case closure recommended by the recording officer.
              </p>
            )}
            {viewing.vawc_case && (
              <Link
                to={`/vawc/cases/${viewing.vawc_case.id}`}
                className="block w-full cursor-pointer rounded-full bg-primary py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Open full case
              </Link>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
