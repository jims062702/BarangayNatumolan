import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { HealthVisit, Resident } from "../../types";

export default function PatientVisits() {
  const [rows, setRows] = useState<HealthVisit[]>([]);
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [patient, setPatient] = useState<Resident | null>(null);
  const [reason, setReason] = useState("");
  const [temperature, setTemperature] = useState("");
  const [bp, setBp] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [advice, setAdvice] = useState("");
  const [referral, setReferral] = useState(false);
  const [referralDest, setReferralDest] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/health/visits", { params: { page, date: date || undefined } })
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

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Record this patient visit?", confirmText: "Yes, record" }))) return;
    setFeedback("");
    try {
      await api.post("/health/visits", {
        patient_id: patient?.id,
        visit_date: new Date().toISOString().slice(0, 10),
        visit_reason: reason,
        temperature: temperature || undefined,
        blood_pressure: bp || undefined,
        heart_rate: heartRate || undefined,
        symptoms: symptoms || undefined,
        treatment_advice: advice || undefined,
        referral_recommended: referral,
        referral_destination: referral ? referralDest : undefined,
      });
      setCreateOpen(false);
      setPatient(null);
      setReason("");
      setFeedback("Visit recorded.");
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Patient Visits & Triage"
        subtitle="Consultations, vital signs, and referrals at the Barangay Health Station"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + Record visit
          </button>
        }
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
            <button type="button" onClick={() => setDate("")} className="cursor-pointer text-sm font-medium text-primary hover:underline">
              Clear
            </button>
          )}
        </div>

        <DataTable
          columns={[
            {
              header: "Patient",
              render: (v: HealthVisit) => (v.patient ? `${v.patient.first_name} ${v.patient.last_name}` : "—"),
            },
            { header: "Date", render: (v: HealthVisit) => new Date(v.visit_date).toLocaleDateString("en-PH") },
            { header: "Reason", render: (v: HealthVisit) => v.visit_reason },
            { header: "BP", render: (v: HealthVisit) => v.blood_pressure ?? "—" },
            { header: "Temp", render: (v: HealthVisit) => (v.temperature ? `${v.temperature}°C` : "—") },
            {
              header: "Referral",
              render: (v: HealthVisit) =>
                v.referral_recommended ? (
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">Referred</span>
                ) : (
                  "—"
                ),
            },
          ]}
          rows={rows}
          rowKey={(v) => v.id}
          searchable
          searchPlaceholder="Search by patient or reason…"
          getSearchText={(v) =>
            `${v.patient ? `${v.patient.first_name} ${v.patient.last_name}` : ""} ${v.visit_reason}`
          }
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Record Patient Visit" wide>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Patient" required>
              <ResidentPicker value={patient} onChange={setPatient} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Reason for visit" required>
              <input value={reason} onChange={(e) => setReason(e.target.value)} required className={inputClasses} />
            </FormField>
          </div>
          <FormField label="Temperature (°C)">
            <input type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} className={inputClasses} />
          </FormField>
          <FormField label="Blood pressure">
            <input value={bp} onChange={(e) => setBp(e.target.value)} className={inputClasses} placeholder="120/80" />
          </FormField>
          <FormField label="Heart rate (bpm)">
            <input type="number" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} className={inputClasses} />
          </FormField>
          <FormField label="Symptoms">
            <input value={symptoms} onChange={(e) => setSymptoms(e.target.value)} className={inputClasses} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Treatment / advice">
              <textarea value={advice} onChange={(e) => setAdvice(e.target.value)} rows={2} className={`${inputClasses} resize-none`} />
            </FormField>
          </div>
          <FormField label="Refer to higher facility?">
            <label className="flex h-[42px] cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={referral} onChange={(e) => setReferral(e.target.checked)} className="h-4 w-4 accent-primary" />
              Yes
            </label>
          </FormField>
          <FormField label="Referral destination">
            <input value={referralDest} onChange={(e) => setReferralDest(e.target.value)} disabled={!referral} className={inputClasses} placeholder="RHU / Hospital" />
          </FormField>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!patient}
              className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              Save visit
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
