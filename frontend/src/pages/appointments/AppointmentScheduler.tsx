import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { formatWallClock } from "../../lib/datetime";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import { FiCheck, FiXCircle, FiEdit3 } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import Modal from "../../components/UI/Modal";
import type { Appointment } from "../../types";

export default function AppointmentScheduler() {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /*
   * The minutes sheet.
   *
   * Kept out of the booking form on purpose: booking is the front desk's act
   * and minute-taking is the secretary's, and the API gates them separately.
   */
  const [minuting, setMinuting] = useState<Appointment | null>(null);
  const [attendance, setAttendance] = useState("Awaiting");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [minutes, setMinutes] = useState("");
  const [savingMinutes, setSavingMinutes] = useState(false);

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
      .get("/appointments", { params: { page, date: date || undefined } })
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
  }, [page, date]);

  // Live updates: bookings and cancellations appear without a refresh.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("appointments", () => load(true));

  /** "14:30" out of a time column that may arrive as "14:30:00". */
  const asTime = (value: string | null | undefined) => (value ? value.slice(0, 5) : "");

  const openMinutes = (a: Appointment) => {
    setMinuting(a);
    setAttendance(a.attendance ?? "Awaiting");
    setStartedAt(asTime(a.started_at));
    setEndedAt(asTime(a.ended_at));
    setMinutes(a.minutes ?? "");
  };

  const saveMinutes = async () => {
    if (!minuting) return;
    setSavingMinutes(true);

    try {
      await api.post(`/appointments/${minuting.id}/minutes`, {
        attendance,
        /* Nobody came, so there is no time it ran — the server clears these
           too, but sending them would be claiming a meeting happened. */
        started_at: attendance === "Absent" ? null : startedAt || null,
        ended_at: attendance === "Absent" ? null : endedAt || null,
        minutes: minutes || null,
      });
      toast(`Minutes recorded for ${minuting.appointment_number}.`);
      setMinuting(null);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingMinutes(false);
    }
  };

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
      toast(`${appointment.appointment_number} confirmed.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const cancel = async (appointment: Appointment) => {
    const reason = window.prompt("Cancellation reason:");
    if (!reason) return;
    try {
      await api.post(`/appointments/${appointment.id}/cancel`, { cancellation_reason: reason });
      toast(`${appointment.appointment_number} cancelled.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Scheduled visits across all offices — residents book from the portal"
      />

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
              /*
                "Who" rather than "Resident": half of these are now visitors
                the register has never heard of, and a column headed Resident
                showing a dash for them said the row was broken.
              */
              header: "Who",
              render: (a: Appointment) =>
                a.resident ? (
                  `${a.resident.first_name} ${a.resident.last_name}`
                ) : a.guest_name ? (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-dark">{a.guest_name}</p>
                    {/* The number is the only way back to a visitor, so it is
                        on the row rather than behind a click. */}
                    <p className="text-xs text-gray-500">
                      {a.guest_contact}
                      <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                        visitor
                      </span>
                    </p>
                  </div>
                ) : (
                  "—"
                ),
            },
            {
              header: "About",
              render: (a: Appointment) => (
                <span className="line-clamp-2 max-w-xs text-xs text-gray-600">
                  {a.purpose || a.notes || "—"}
                </span>
              ),
            },
            { header: "Office", render: (a: Appointment) => a.office },
            {
              header: "Schedule",
              render: (a: Appointment) => formatWallClock(a.scheduled_datetime),
            },
            { header: "Status", render: (a: Appointment) => <StatusBadge status={a.status} /> },
            {
              /*
                What actually happened, beside what was booked. "Awaiting"
                reads as not yet answered rather than as a claim either way.
              */
              header: "Attendance",
              render: (a: Appointment) =>
                !a.attendance || a.attendance === "Awaiting" ? (
                  <span className="text-sm text-gray-400">Not taken</span>
                ) : (
                  <div>
                    <StatusBadge status={a.attendance} />
                    {a.started_at && (
                      <p className="mt-1 text-xs text-gray-500">
                        {asTime(a.started_at)}
                        {a.ended_at ? ` – ${asTime(a.ended_at)}` : ""}
                      </p>
                    )}
                  </div>
                ),
            },
            {
              header: "Actions",
              render: (a: Appointment) => (
                <RowActions>
                  {["Scheduled", "Pending"].includes(a.status) && (
                    <RowAction
                      label="Confirm appointment"
                      icon={FiCheck}
                      tone="primary"
                      onClick={() => confirm(a)}
                    />
                  )}
                  {/* The secretary's act, and available for as long as the
                      appointment was not cancelled — minutes are often
                      written up after the fact. */}
                  {a.status !== "Cancelled" && (
                    <RowAction
                      label="Record attendance & minutes"
                      icon={FiEdit3}
                      onClick={() => openMinutes(a)}
                    />
                  )}
                  {!["Cancelled", "Completed"].includes(a.status) && (
                    <RowAction
                      label="Cancel appointment"
                      icon={FiXCircle}
                      tone="danger"
                      onClick={() => cancel(a)}
                    />
                  )}
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search by name or appointment #…"
          getSearchText={(a) =>
            [
              a.appointment_number,
              a.resident ? `${a.resident.first_name} ${a.resident.last_name}` : "",
              /* A visitor is findable by the two things the office has: the
                 name they gave and the number they gave. */
              a.guest_name ?? "",
              a.guest_contact ?? "",
              a.office,
            ].join(" ")
          }
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        open={minuting !== null}
        onClose={() => setMinuting(null)}
        title={minuting ? `Minutes · ${minuting.appointment_number}` : "Minutes"}
      >
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Attendance" required>
              <select
                value={attendance}
                onChange={(e) => setAttendance(e.target.value)}
                className={inputClasses}
              >
                <option value="Awaiting">Awaiting — not yet known</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
              </select>
            </FormField>

            {/*
              Hidden when nobody came. A form that asks what time an absent
              resident started is a form that invites a wrong answer.
            */}
            {attendance !== "Absent" && (
              <>
                <FormField label="Started">
                  <input
                    type="time"
                    value={startedAt}
                    onChange={(e) => setStartedAt(e.target.value)}
                    className={inputClasses}
                  />
                </FormField>

                <FormField label="Ended">
                  <input
                    type="time"
                    value={endedAt}
                    onChange={(e) => setEndedAt(e.target.value)}
                    className={inputClasses}
                  />
                </FormField>
              </>
            )}
          </div>

          <FormField label="What was discussed and agreed">
            <textarea
              rows={8}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputClasses}
              placeholder="The record of the meeting"
            />
          </FormField>

          <div className="flex justify-end gap-3 border-t border-gray pt-4">
            <button
              type="button"
              onClick={() => setMinuting(null)}
              className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition hover:border-primary/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveMinutes}
              disabled={savingMinutes}
              className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {savingMinutes ? "Saving…" : "Save the minutes"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
