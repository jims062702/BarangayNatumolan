import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { FiCheck, FiX, FiPlus } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { PopulationEvent, Resident } from "../../types";

const EVENT_TYPES = [
  "Birth",
  "Death",
  "Transfer In",
  "Transfer Out",
  "Address Change",
  "Household Change",
  "Residency Status Change",
];

export default function PopulationEvents() {
  const [rows, setRows] = useState<PopulationEvent[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [resident, setResident] = useState<Resident | null>(null);
  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/population/events", { params: { page } })
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
  }, [page]);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Record this population event?", confirmText: "Yes, record" }))) return;
    try {
      await api.post("/population/events", {
        event_type: eventType,
        resident_id: resident?.id,
        event_date: eventDate,
        description,
      });
      setCreateOpen(false);
      setDescription("");
      setResident(null);
      toast("Event recorded, pending verification.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const verify = async (row: PopulationEvent, status: "Verified" | "Rejected") => {
    if (
      !(await confirmAction({
        title: `Mark this event as ${status}?`,
        confirmText: `Yes, ${status.toLowerCase()}`,
        danger: status === "Rejected",
      }))
    )
      return;
    try {
      await api.put(`/population/events/${row.id}/verify`, { verification_status: status });
      toast(`Event marked ${status}.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Population Movement & Demographic Events"
        subtitle="Births, deaths, transfers, and residency changes — administrative recording only"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> Record event
          </button>
        }
      />

      <div className="mb-4 rounded-2xl border border-gray bg-secondary px-4 py-3 text-xs text-gray-500">
        This module records administrative population events only — it does not
        issue official birth, marriage, or death certificates, which remain
        under the civil registry.
      </div>

      <Card>
        <DataTable
          columns={[
            { header: "Type", render: (e: PopulationEvent) => e.event_type },
            {
              header: "Resident",
              render: (e: PopulationEvent) => (e.resident ? `${e.resident.first_name} ${e.resident.last_name}` : "—"),
            },
            { header: "Date", render: (e: PopulationEvent) => new Date(e.event_date).toLocaleDateString("en-PH") },
            { header: "Description", render: (e: PopulationEvent) => e.description ?? "—" },
            { header: "Status", render: (e: PopulationEvent) => <StatusBadge status={e.verification_status} /> },
            {
              header: "Actions",
              render: (e: PopulationEvent) =>
                e.verification_status === "Pending" ? (
                  <RowActions>
                    <RowAction
                      label="Verify event"
                      icon={FiCheck}
                      tone="primary"
                      onClick={() => verify(e, "Verified")}
                    />
                    <RowAction
                      label="Reject event"
                      icon={FiX}
                      tone="danger"
                      onClick={() => verify(e, "Rejected")}
                    />
                  </RowActions>
                ) : null,
            },
          ]}
          rows={rows}
          rowKey={(e) => e.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by resident or description…"
          getSearchText={(e) =>
            `${e.event_type} ${
              e.resident ? `${e.resident.first_name} ${e.resident.last_name}` : ""
            } ${e.description ?? ""}`
          }
          filters={[
            { label: "Type", getValue: (e) => e.event_type },
            { label: "Status", getValue: (e) => e.verification_status },
          ]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Record Population Event">
        <form onSubmit={create} className="space-y-4">
          <FormField label="Event type" required>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputClasses}>
              {EVENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Related resident" plain>
            <ResidentPicker value={resident} onChange={setResident} />
          </FormField>
          <FormField label="Event date" required>
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Description" required>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={2} className={`${inputClasses} resize-none`} />
          </FormField>
          <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Record event
          </button>
        </form>
      </Modal>
    </div>
  );
}
