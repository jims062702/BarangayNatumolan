import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import PhoneInput from "../../components/UI/PhoneInput";
import type { Household, Resident } from "../../types";

function householdLabel(h: Household): string {
  const owner = h.head ? `${h.head.first_name} ${h.head.last_name}` : "no owner set";
  return `${h.household_number} · ${h.zone_purok ?? "—"} · Owner: ${owner}`;
}

const SECTORS = [
  "Senior Citizen",
  "PWD",
  "Solo Parent",
  "Youth",
  "Children Under Five",
  "Pregnant Women",
  "4Ps Household",
  "Unemployed",
  "Informal Worker",
];

const CLASSIFICATIONS = ["Senior Citizen", "PWD", "Solo Parent", "Youth", "Child", "Others"];

type EditForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  gender: string;
  birthdate: string;
  civil_status: string;
  occupation: string;
  contact_number: string;
  email: string;
  household_id: string;
  zone_purok: string;
  residency_status: string;
  length_of_residence_years: string;
  educational_attainment: string;
  demographic_classification: string;
  is_active: string;
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray/60 py-2.5 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-dark">{value || "—"}</span>
    </div>
  );
}

export default function ResidentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [resident, setResident] = useState<Resident | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sectorOpen, setSectorOpen] = useState(false);
  const [sectorType, setSectorType] = useState(SECTORS[0]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [saving, setSaving] = useState(false);

  const isBpo = user?.office === "Population" || user?.role === "Admin";
  const canEdit =
    ["Main Office", "Population"].includes(user?.office ?? "") ||
    ["Punong Barangay", "Admin"].includes(user?.role ?? "");

  const load = () => {
    api.get(`/residents/${id}`).then((r) => setResident(r.data.data)).catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openEdit = () => {
    if (!resident) return;
    setEditForm({
      first_name: resident.first_name ?? "",
      middle_name: resident.middle_name ?? "",
      last_name: resident.last_name ?? "",
      suffix: resident.suffix ?? "",
      gender: resident.gender ?? "Male",
      birthdate: resident.birthdate ? resident.birthdate.slice(0, 10) : "",
      civil_status: resident.civil_status ?? "Single",
      occupation: resident.occupation ?? "",
      contact_number: resident.contact_number ?? "",
      email: resident.email ?? "",
      household_id: resident.household_id ? String(resident.household_id) : "",
      zone_purok: resident.zone_purok ?? "Purok 1",
      residency_status: resident.residency_status ?? "Permanent",
      length_of_residence_years: "",
      educational_attainment: "",
      demographic_classification: resident.demographic_classification ?? "",
      is_active: resident.is_active === false ? "0" : "1",
    });
    setEditOpen(true);
    if (households.length === 0) {
      api.get("/residents/household-options").then((r) => setHouseholds(r.data.data ?? [])).catch(() => undefined);
    }
  };

  const setField = (key: keyof EditForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setEditForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));

  // Selecting a household also fills the resident's Purok from that household.
  const selectHousehold = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const household = households.find((h) => String(h.id) === id);
    setEditForm((prev) =>
      prev ? { ...prev, household_id: id, zone_purok: household?.zone_purok || prev.zone_purok } : prev
    );
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editForm) return;
    setSaving(true);
    setFeedback("");
    try {
      const payload: Record<string, unknown> = {
        ...editForm,
        household_id: editForm.household_id ? Number(editForm.household_id) : null,
        demographic_classification: editForm.demographic_classification || null,
        is_active: editForm.is_active === "1",
      };
      // Drop empty optional strings so we don't overwrite with blanks
      ["length_of_residence_years", "educational_attainment"].forEach((k) => {
        if (payload[k] === "") delete payload[k];
      });
      await api.put(`/residents/${id}`, payload);
      setEditOpen(false);
      setFeedback("Resident information updated.");
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addSector = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    try {
      await api.post(`/residents/${id}/sectors`, {
        sector_type: sectorType,
        enrolled_date: new Date().toISOString().slice(0, 10),
      });
      setSectorOpen(false);
      setFeedback(`Tagged as ${sectorType}.`);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    try {
      await api.post(`/population/residents/${id}/create-account`, {
        email: accountEmail,
        password: accountPassword,
      });
      setAccountOpen(false);
      setFeedback(`Portal account created for ${accountEmail}. Share the credentials securely.`);
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  if (!resident) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading resident…</p>;
  }

  return (
    <div>
      <PageHeader
        title={`${resident.first_name} ${resident.last_name}`}
        subtitle={`Resident No. ${resident.resident_number}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={openEdit}
                className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Edit information
              </button>
            )}
            {isBpo && (
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="cursor-pointer rounded-full border border-primary/40 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
              >
                Create portal account
              </button>
            )}
          </div>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Personal information">
          <Row label="Full name" value={`${resident.first_name} ${resident.middle_name ?? ""} ${resident.last_name} ${resident.suffix ?? ""}`.replace(/\s+/g, " ")} />
          <Row label="Gender" value={resident.gender} />
          <Row label="Birthdate" value={resident.birthdate ? new Date(resident.birthdate).toLocaleDateString("en-PH", { dateStyle: "long" }) : null} />
          <Row label="Civil status" value={resident.civil_status} />
          <Row label="Occupation" value={resident.occupation} />
          <Row label="Contact" value={resident.contact_number} />
          <Row label="Email" value={resident.email} />
        </Card>

        <Card title="Residency & household">
          <Row label="Zone / Purok" value={resident.zone_purok} />
          <Row label="Residency status" value={resident.residency_status} />
          <Row label="Household" value={resident.household?.household_number} />
          <Row label="Address" value={resident.household?.street_address} />
          <Row label="Classification" value={resident.demographic_classification} />
        </Card>

        <Card
          title="Sector master lists"
          action={
            <button
              type="button"
              onClick={() => setSectorOpen(true)}
              className="cursor-pointer text-sm font-medium text-primary hover:underline"
            >
              + Tag sector
            </button>
          }
        >
          {(resident.sectors ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Not in any sector list.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {resident.sectors?.map((sector) => (
                <span key={sector.id} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  {sector.sector_type}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Service request history">
          {(resident.service_requests ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No requests on record.</p>
          ) : (
            <ul className="divide-y divide-gray/70">
              {resident.service_requests?.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-dark">{request.service_type}</p>
                    <p className="text-xs text-gray-500">{request.request_number}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Certificates issued">
          {(resident.certificates ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No certificates on record.</p>
          ) : (
            <ul className="divide-y divide-gray/70">
              {resident.certificates?.map((certificate) => (
                <li key={certificate.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-dark">{certificate.certificate_type}</p>
                    <p className="font-mono text-xs text-gray-500">{certificate.reference_number}</p>
                  </div>
                  <StatusBadge status={certificate.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Resident Information" wide>
        {editForm && (
          <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" required>
              <input value={editForm.first_name} onChange={setField("first_name")} required className={inputClasses} />
            </FormField>
            <FormField label="Middle name">
              <input value={editForm.middle_name} onChange={setField("middle_name")} className={inputClasses} />
            </FormField>
            <FormField label="Last name" required>
              <input value={editForm.last_name} onChange={setField("last_name")} required className={inputClasses} />
            </FormField>
            <FormField label="Suffix">
              <input value={editForm.suffix} onChange={setField("suffix")} className={inputClasses} />
            </FormField>
            <FormField label="Gender">
              <select value={editForm.gender} onChange={setField("gender")} className={inputClasses}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </FormField>
            <FormField label="Birthdate">
              <input type="date" value={editForm.birthdate} onChange={setField("birthdate")} className={inputClasses} />
            </FormField>
            <FormField label="Civil status">
              <select value={editForm.civil_status} onChange={setField("civil_status")} className={inputClasses}>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
                <option>Separated</option>
              </select>
            </FormField>
            <FormField label="Occupation">
              <input value={editForm.occupation} onChange={setField("occupation")} className={inputClasses} />
            </FormField>
            <FormField label="Contact number" hint="Philippine mobile — 10 digits after +63">
              <PhoneInput
                value={editForm.contact_number}
                onChange={(v) => setEditForm((prev) => (prev ? { ...prev, contact_number: v } : prev))}
              />
            </FormField>
            <FormField label="Email">
              <input type="email" value={editForm.email} onChange={setField("email")} className={inputClasses} />
            </FormField>
            <FormField label="Household (Household No. / Address)" hint="Sets the household, address & Purok">
              <select value={editForm.household_id} onChange={selectHousehold} className={inputClasses}>
                <option value="">— No household —</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {householdLabel(h)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Zone / Purok">
              <select value={editForm.zone_purok} onChange={setField("zone_purok")} className={inputClasses}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>Purok {n}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Residency status">
              <select value={editForm.residency_status} onChange={setField("residency_status")} className={inputClasses}>
                <option>Permanent</option>
                <option>Temporary</option>
                <option>Migrant</option>
              </select>
            </FormField>
            <FormField label="Classification">
              <select value={editForm.demographic_classification} onChange={setField("demographic_classification")} className={inputClasses}>
                <option value="">— None —</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Length of residence (years)">
              <input type="number" min="0" value={editForm.length_of_residence_years} onChange={setField("length_of_residence_years")} className={inputClasses} placeholder="Leave blank to keep" />
            </FormField>
            <FormField label="Educational attainment">
              <input value={editForm.educational_attainment} onChange={setField("educational_attainment")} className={inputClasses} placeholder="Leave blank to keep" />
            </FormField>
            <FormField label="Record status">
              <select value={editForm.is_active} onChange={setField("is_active")} className={inputClasses}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </FormField>

            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="cursor-pointer rounded-full border border-gray px-6 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={sectorOpen} onClose={() => setSectorOpen(false)} title="Tag sector membership">
        <form onSubmit={addSector} className="space-y-4">
          <FormField label="Sector" required>
            <select value={sectorType} onChange={(e) => setSectorType(e.target.value)} className={inputClasses}>
              {SECTORS.map((sector) => (
                <option key={sector}>{sector}</option>
              ))}
            </select>
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Add to master list
          </button>
        </form>
      </Modal>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="Create resident portal account">
        <p className="mb-4 rounded-xl bg-warning/10 px-4 py-2.5 text-xs text-dark">
          Only the Population Office issues portal accounts, after verifying the
          person resides in Barangay Natumolan.
        </p>
        <form onSubmit={createAccount} className="space-y-4">
          <FormField label="Login email" required>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>
          <FormField label="Temporary password" required hint="At least 8 characters — the resident should change it after first login">
            <input
              type="text"
              value={accountPassword}
              onChange={(e) => setAccountPassword(e.target.value)}
              required
              minLength={8}
              className={inputClasses}
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Create account
          </button>
        </form>
      </Modal>
    </div>
  );
}
