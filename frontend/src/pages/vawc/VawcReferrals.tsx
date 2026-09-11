import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import { FiEdit2 } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { VawcReferral } from "../../types";

/** Mirrors the referral_agency enum on vawc_referrals. */
const AGENCIES = [
  "PNP WCPD",
  "DSWD",
  "Rural Health Unit",
  "Hospital",
  "Prosecutor",
  "Public Attorney",
  "Shelter",
  "Counseling Service",
  "Child Protection",
  "Other",
];

const today = () => new Date().toISOString().slice(0, 10);
const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

/** Where a referral stands with the receiving agency. */
const stateOf = (r: VawcReferral) => {
  if (r.is_completed) return "Completed";
  if (r.acknowledgment_date) return "In progress";
  return "Awaiting acknowledgment";
};

const STATE_TONES: Record<string, string> = {
  Completed: "bg-success/10 text-success",
  "In progress": "bg-primary/10 text-primary",
  "Awaiting acknowledgment": "bg-warning/10 text-warning",
};

export default function VawcReferrals() {
  const [rows, setRows] = useState<VawcReferral[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);

  const [editing, setEditing] = useState<VawcReferral | null>(null);
  const [acknowledged, setAcknowledged] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowup, setNextFollowup] = useState("");
  const [completed, setCompleted] = useState(false);

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
      .get("/vawc/referrals", { params: { page, due: dueOnly ? 1 : undefined } })
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

  const openEdit = (referral: VawcReferral) => {
    setEditing(referral);
    setAcknowledged(referral.acknowledgment_date?.slice(0, 10) ?? "");
    setOutcome(referral.outcome ?? "");
    setNextFollowup(referral.followup_schedule?.slice(0, 10) ?? "");
    setCompleted(referral.is_completed);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    if (!(await confirmAction({ title: "Save this referral update?", confirmText: "Yes, save" }))) return;
    try {
      await api.put(`/vawc/referrals/${editing.id}`, {
        acknowledgment_date: acknowledged || null,
        outcome: outcome || null,
        followup_schedule: nextFollowup || null,
        is_completed: completed,
      });
      setEditing(null);
      toast("Referral updated — the access trail recorded this change.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Referral & Service Coordination"
        subtitle="Every referral across the desk — acknowledgment, services, outcome and follow-up"
      />

      <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-dark">
        <strong>Reminder:</strong> referrals carry only the minimum information
        the receiving agency needs. Cases appear by code — open a case to see
        identifiable detail, which is written to the access trail.
      </div>

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
          Show only referrals whose follow-up is due
        </label>

        <DataTable
          columns={[
            {
              header: "Case Code",
              render: (r: VawcReferral) =>
                r.vawc_case ? (
                  <Link
                    to={`/vawc/cases/${r.vawc_case.id}`}
                    className="font-mono font-semibold text-primary hover:underline"
                  >
                    {r.vawc_case.case_code}
                  </Link>
                ) : (
                  "—"
                ),
            },
            { header: "Agency", render: (r: VawcReferral) => r.referral_agency },
            {
              header: "Services requested",
              render: (r: VawcReferral) => (
                <span className="block max-w-xs truncate" title={r.services_requested}>
                  {r.services_requested}
                </span>
              ),
            },
            { header: "Referred", render: (r: VawcReferral) => asDate(r.referral_date) },
            { header: "Acknowledged", render: (r: VawcReferral) => asDate(r.acknowledgment_date) },
            {
              header: "Follow-up",
              render: (r: VawcReferral) => {
                if (!r.followup_schedule) return "—";
                const overdue = new Date(r.followup_schedule) <= new Date(today()) && !r.is_completed;
                return (
                  <span className={overdue ? "font-semibold text-danger" : ""}>
                    {asDate(r.followup_schedule)}
                  </span>
                );
              },
            },
            {
              header: "State",
              render: (r: VawcReferral) => {
                const state = stateOf(r);
                return (
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_TONES[state]}`}
                  >
                    {state}
                  </span>
                );
              },
            },
            {
              header: "Actions",
              render: (r: VawcReferral) => (
                <RowActions>
                  <RowAction label="Update referral" icon={FiEdit2} onClick={() => openEdit(r)} />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by case code, agency or service…"
          getSearchText={(r) =>
            `${r.vawc_case?.case_code ?? ""} ${r.referral_agency} ${r.services_requested}`
          }
          filters={[
            { label: "Agency", getValue: (r) => r.referral_agency, options: AGENCIES },
            { label: "State", getValue: stateOf, options: Object.keys(STATE_TONES) },
          ]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No referrals recorded yet."
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Update referral — ${editing?.vawc_case?.case_code ?? ""}`}
      >
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
            <span className="font-semibold text-dark">{editing?.referral_agency}</span>
            {editing?.receiving_person && <> · {editing.receiving_person}</>}
            <p className="mt-1">{editing?.services_requested}</p>
          </div>
          <FormField label="Acknowledgment date" hint="When the agency confirmed receipt.">
            <input
              type="date"
              value={acknowledged}
              onChange={(e) => setAcknowledged(e.target.value)}
              className={inputClasses}
            />
          </FormField>
          <FormField label="Outcome">
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <FormField label="Next follow-up">
            <input
              type="date"
              value={nextFollowup}
              onChange={(e) => setNextFollowup(e.target.value)}
              className={inputClasses}
            />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            Referral completed — services delivered
          </label>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Save update
          </button>
        </form>
      </Modal>
    </div>
  );
}
