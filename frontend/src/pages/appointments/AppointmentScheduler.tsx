import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { formatWallClock } from "../../lib/datetime";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { Appointment } from "../../types";

export default function AppointmentScheduler() {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/appointments", { params: { page, date: date || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, date]);

  // Live updates: bookings and cancellations appear without a refresh.
  useAutoRefresh(load, REFRESH.staff);

  const confirm = async (appointment: Appointment) => {
    if (
      !(await confirmAction({
        title: "Confirm this appointment?",
        text: `${appointment.appointment_number} will be marked as confirmed.`,
        confirmText: "Yes, confirm",
      }))
    )
      return;
    try {
      await api.post(`/appointments/${appointment.id}/confirm`);
      setFeedback(`${appointment.appointment_number} confirmed.`);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  const cancel = async (appointment: Appointment) => {
    const reason = window.prompt("Cancellation reason:");
    if (!reason) return;
    try {
      await api.post(`/appointments/${appointment.id}/cancel`, { cancellation_reason: reason });
      setFeedback(`${appointment.appointment_number} cancelled.`);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Scheduled visits across all offices — residents book from the portal"
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            className={`${inputClasses} max-w-48`}
            aria-label="Filter by date"
          />
          {date && (
            <button
              type="button"
              onClick={() => setDate("")}
              className="cursor-pointer text-sm font-medium text-primary hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>

        <DataTable
          columns={[
            {
              header: "Appointment #",
              render: (a: Appointment) => <span className="font-medium text-dark">{a.appointment_number}</span>,
            },
            {
              header: "Resident",
              render: (a: Appointment) =>
                a.resident ? `${a.resident.first_name} ${a.resident.last_name}` : "—",
            },
            { header: "Office", render: (a: Appointment) => a.office },
            {
              header: "Schedule",
              render: (a: Appointment) => formatWallClock(a.scheduled_datetime),
            },
            { header: "Status", render: (a: Appointment) => <StatusBadge status={a.status} /> },
            {
              header: "Actions",
              render: (a: Appointment) => (
                <div className="flex gap-1.5">
                  {["Scheduled", "Pending"].includes(a.status) && (
                    <button
                      type="button"
                      onClick={() => confirm(a)}
                      className="cursor-pointer rounded-full bg-success px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Confirm
                    </button>
                  )}
                  {!["Cancelled", "Completed"].includes(a.status) && (
                    <button
                      type="button"
                      onClick={() => cancel(a)}
                      className="cursor-pointer rounded-full border border-danger/40 px-3 py-1 text-xs font-semibold text-danger hover:bg-danger hover:text-white"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          searchable
          searchPlaceholder="Search by name or appointment #…"
          getSearchText={(a) =>
            `${a.appointment_number} ${
              a.resident ? `${a.resident.first_name} ${a.resident.last_name}` : ""
            } ${a.office}`
          }
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
