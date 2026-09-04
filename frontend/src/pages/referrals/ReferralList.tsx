import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { Referral, Resident } from "../../types";

/** Mirrors the receiving_office enum on the referrals table. */
const RECEIVING_OFFICES = [
  "PNP WCPD",
  "DSWD",
  "Rural Health Unit",
  "Hospital",
  "Prosecutor",
  "Public Attorney",
  "Shelter",
  "Counseling",
  "Child Protection",
  "Lupon",
  "Other",
];

const STATUSES = ["Pending", "Acknowledged", "In Progress", "Completed", "Not Attended"];

const today = () => new Date().toISOString().slice(0, 10);
const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH") : "—";

const residentName = (r: Referral) =>
  r.resident ? `${r.resident.first_name} ${r.resident.last_name}` : "—";

export default function ReferralList() {
  const [rows, setRows] = useState<Referral[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [resident, setResident] = useState<Resident | null>(null);
  const [receivingOffice, setReceivingOffice] = useState(RECEIVING_OFFICES[0]);
  const [reason, setReason] = useState("");
  const [requiredInfo, setRequiredInfo] = useState("");
  const [referralDate, setReferralDate] = useState(today());
  const [followupDate, setFollowupDate] = useState("");

  // Outcome form
  const [outcomeFor, setOutcomeFor] = useState<Referral | null>(null);
  const [status, setStatus] = useState("Acknowledged");
  const [servicesProvided, setServicesProvided] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowup, setNextFollowup] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/referrals", { params: { page, due: dueOnly ? 1 : undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, dueOnly]);

  useAutoRefresh(load, REFRESH.staff);

  const resetCreate = () => {
    setResident(null);
    setReason("");
    setRequiredInfo("");
    setFollowupDate("");
    setReferralDate(today());
  };

  const closeCreate = () => {
    setCreateOpen(false);
    resetCreate();
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resident) {
      toast("Select the resident being referred.");
      return;
    }
    if (!(await confirmAction({ title: "Create this referral?", confirmText: "Yes, refer" }))) return;
    try {
      await api.post("/referrals", {
        resident_id: resident.id,
        receiving_office: receivingOffice,
        referral_reason: reason,
        required_information: requiredInfo || null,
        referral_date: referralDate,
        followup_date: followupDate || null,
      });
      setCreateOpen(false);
      resetCreate();
      toast("Referral created and the resident has been notified.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const openOutcome = (row: Referral) => {
    setOutcomeFor(row);
    setStatus(row.status === "Pending" ? "Acknowledged" : row.status);
    setServicesProvided(row.services_provided ?? "");
    setOutcome(row.referral_outcome ?? "");
    setNextFollowup(row.followup_date ?? "");
  };

  const saveOutcome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!outcomeFor) return;
    if (!(await confirmAction({ title: "Save this referral update?", confirmText: "Yes, save" }))) return;
    try {
      await api.put(`/referrals/${outcomeFor.id}`, {
        status,
        services_provided: servicesProvided || null,
        referral_outcome: outcome || null,
        followup_date: nextFollowup || null,
      });
      setOutcomeFor(null);
      toast(`Referral ${outcomeFor.referral_number} updated.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const remove = async (row: Referral) => {
    if (
      !(await confirmAction({
        title: `Withdraw ${row.referral_number}?`,
        text: "This deletes the referral. Only possible while it is still pending.",
        confirmText: "Yes, withdraw",
        danger: true,
      }))
    )
      return;
    try {
      await api.delete(`/referrals/${row.id}`);
      toast(`${row.referral_number} withdrawn.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Referrals & Service Coordination"
        subtitle="Refer residents to the proper office or agency and track acknowledgment, services and outcome"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + New referral
          </button>
        }
      />

      <div className="mb-4 rounded-2xl border border-gray bg-secondary px-4 py-3 text-xs text-gray-500">
        Send only the minimum information the receiving office needs. VAWC
        referrals are handled inside the VAWC Desk and never appear here.
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
          Show only follow-ups that are due
        </label>

        <DataTable
          columns={[
            { header: "Referral No.", render: (r: Referral) => r.referral_number },
            { header: "Resident", render: residentName },
            { header: "From", render: (r: Referral) => r.referring_office },
            { header: "Referred to", render: (r: Referral) => r.receiving_office },
            { header: "Date", render: (r: Referral) => asDate(r.referral_date) },
            {
              header: "Follow-up",
              render: (r: Referral) => {
                if (!r.followup_date) return "—";
                const overdue =
                  new Date(r.followup_date) <= new Date(today()) &&
                  !["Completed", "Not Attended"].includes(r.status);
                return (
                  <span className={overdue ? "font-semibold text-danger" : ""}>
                    {asDate(r.followup_date)}
                  </span>
                );
              },
            },
            { header: "Status", render: (r: Referral) => <StatusBadge status={r.status} /> },
            {
              header: "Actions",
              render: (r: Referral) => (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => openOutcome(r)}
                    className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    Update
                  </button>
                  {/* Only an untouched referral can be withdrawn; once an
                      agency has acknowledged it the exchange is on record. */}
                  {r.status === "Pending" && !r.acknowledgment_date && (
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      className="cursor-pointer rounded-full border border-danger/40 px-3 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger hover:text-white"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search by referral number, resident or agency…"
          getSearchText={(r) =>
            `${r.referral_number} ${residentName(r)} ${r.receiving_office} ${r.referral_reason}`
          }
          filters={[
            { label: "Status", getValue: (r) => r.status, options: STATUSES },
            { label: "Referred to", getValue: (r) => r.receiving_office },
          ]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No referrals recorded yet."
        />
      </Card>

      <Modal open={createOpen} onClose={closeCreate} title="New Referral">
        <form onSubmit={create} className="space-y-4">
          <FormField label="Resident" required plain>
            <ResidentPicker value={resident} onChange={setResident} />
          </FormField>
          <FormField label="Refer to" required>
            <select
              value={receivingOffice}
              onChange={(e) => setReceivingOffice(e.target.value)}
              className={inputClasses}
            >
              {RECEIVING_OFFICES.map((office) => (
                <option key={office}>{office}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Reason for referral" required>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={2}
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <FormField
            label="Information shared"
            hint="Only what the receiving office needs to act on the referral."
          >
            <textarea
              value={requiredInfo}
              onChange={(e) => setRequiredInfo(e.target.value)}
              rows={2}
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Referral date" required>
              <input
                type="date"
                value={referralDate}
                onChange={(e) => setReferralDate(e.target.value)}
                required
                className={inputClasses}
              />
            </FormField>
            <FormField label="Follow-up date">
              <input
                type="date"
                value={followupDate}
                min={referralDate}
                onChange={(e) => setFollowupDate(e.target.value)}
                className={inputClasses}
              />
            </FormField>
          </div>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Create referral
          </button>
        </form>
      </Modal>

      <Modal
        open={outcomeFor !== null}
        onClose={() => setOutcomeFor(null)}
        title={`Update ${outcomeFor?.referral_number ?? "Referral"}`}
      >
        <form onSubmit={saveOutcome} className="space-y-4">
          <div className="rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
            {outcomeFor && (
              <>
                <span className="font-semibold text-dark">{residentName(outcomeFor)}</span> →{" "}
                {outcomeFor.receiving_office}
                <p className="mt-1">{outcomeFor.referral_reason}</p>
              </>
            )}
          </div>
          <FormField label="Status" required>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClasses}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Services provided">
            <textarea
              value={servicesProvided}
              onChange={(e) => setServicesProvided(e.target.value)}
              rows={2}
              className={`${inputClasses} resize-none`}
            />
          </FormField>
          <FormField label="Outcome">
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={2}
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
