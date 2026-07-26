import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
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
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [child, setChild] = useState<Resident | null>(null);
  const [vaccine, setVaccine] = useState(VACCINES[0]);
  const [vaccinationDate, setVaccinationDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Completed");

  const load = () => {
    setLoading(true);
    api
      .get("/health/immunization", { params: { page, status: statusFilter || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Record this immunization?", confirmText: "Yes, record" }))) return;
    setFeedback("");
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
      setFeedback("Immunization record saved.");
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
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
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + Record vaccine
          </button>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

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
          <FormField label="Child" required>
            <ResidentPicker value={child} onChange={setChild} />
          </FormField>
          <FormField label="Vaccine" required>
            <select value={vaccine} onChange={(e) => setVaccine(e.target.value)} className={inputClasses}>
              {VACCINES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
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
