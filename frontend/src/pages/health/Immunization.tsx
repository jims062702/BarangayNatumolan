import { useEffect, useState, type FormEvent } from "react";
import { FiPlus } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { ImmunizationRecord, Resident } from "../../types";

const VACCINES = [
  "BCG",
  "Hepatitis B",
  "Pentavalent (1st dose)",
  "Pentavalent (2nd dose)",
  "Pentavalent (3rd dose)",
  "OPV",
  "IPV",
  "PCV",
  "MMR (1st dose)",
  "MMR (2nd dose)",
];

const STATUS_TABS = ["", "Pending", "Missed", "Completed"];

export default function Immunization() {
  const [rows, setRows] = useState<ImmunizationRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  /*
   * How many sit under each chip. Of the whole list rather than the page,
   * and unmoved by which chip is picked — otherwise the chosen one would
   * read its total and every other would read zero, which is exactly the
   * question the chips are there to answer.
   */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [child, setChild] = useState<Resident | null>(null);
  const [vaccine, setVaccine] = useState(VACCINES[0]);
  const [vaccinationDate, setVaccinationDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Completed");

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
      .get("/health/immunization", { params: { page, status: statusFilter || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setCounts(r.data.data.counts ?? {});
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Live updates without a manual refresh.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("health", () => load(true));

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Record this immunization?", confirmText: "Yes, record" }))) return;
    try {
      await api.post("/health/immunization", {
        child_id: child?.id,
        vaccine_name: vaccine,
        vaccination_date: vaccinationDate,
        scheduled_date: vaccinationDate,
        status,
      });
      setCreateOpen(false);
      setChild(null);
      toast("Immunization record saved.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Immunization Schedule Board"
        subtitle="Track vaccines given, due, and missed per DOH schedule"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> Record vaccine
          </button>
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab || "all"}
              type="button"
              onClick={() => {
                setStatusFilter(tab);
                setPage(1);
              }}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === tab ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {tab || "All"}
              {tab && counts[tab] ? (
                <span className="ml-1.5 opacity-70">{counts[tab]}</span>
              ) : null}
            </button>
          ))}
        </div>

        <DataTable
          columns={[
            {
              header: "Child",
              render: (r: ImmunizationRecord) => (r.child ? `${r.child.first_name} ${r.child.last_name}` : "—"),
            },
            { header: "Vaccine", render: (r: ImmunizationRecord) => r.vaccine_name },
            {
              header: "Date",
              render: (r: ImmunizationRecord) =>
                r.scheduled_date
                  ? new Date(r.scheduled_date).toLocaleDateString("en-PH")
                  : new Date(r.vaccination_date).toLocaleDateString("en-PH"),
            },
            { header: "Status", render: (r: ImmunizationRecord) => <StatusBadge status={r.status} /> },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by child or vaccine…"
          getSearchText={(r) =>
            `${r.child ? `${r.child.first_name} ${r.child.last_name}` : ""} ${r.vaccine_name}`
          }
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Record Immunization">
        <form onSubmit={create} className="space-y-4">
          <FormField label="Child" required plain>
            <ResidentPicker value={child} onChange={setChild} />
          </FormField>
          <FormField label="Vaccine" required>
            <select value={vaccine} onChange={(e) => setVaccine(e.target.value)} className={inputClasses}>
              {VACCINES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Date" required>
              <input type="date" value={vaccinationDate} onChange={(e) => setVaccinationDate(e.target.value)} required className={inputClasses} />
            </FormField>
            <FormField label="Status" required>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClasses}>
                <option>Completed</option>
                <option>Pending</option>
                <option>Missed</option>
                <option>Rescheduled</option>
              </select>
            </FormField>
          </div>
          <button
            type="submit"
            disabled={!child}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            Save record
          </button>
        </form>
      </Modal>
    </div>
  );
}
