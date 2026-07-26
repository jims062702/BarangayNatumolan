import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import Card from "../../components/UI/Card";
import Breadcrumbs from "../../components/UI/Breadcrumbs";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import PhoneInput from "../../components/UI/PhoneInput";
import HouseholdPicker from "../../components/UI/HouseholdPicker";
import type { Household, Resident } from "../../types";

const CLASSIFICATIONS = ["Senior Citizen", "PWD", "Solo Parent", "Youth", "Child", "Adult", "Others"];

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

export default function ResidentEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [resident, setResident] = useState<Resident | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get(`/residents/${id}`)
      .then((r) => {
        const res: Resident = r.data.data;
        setResident(res);
        setSelectedHousehold(res.household ?? null);
        setForm({
          first_name: res.first_name ?? "",
          middle_name: res.middle_name ?? "",
          last_name: res.last_name ?? "",
          suffix: res.suffix ?? "",
          gender: res.gender ?? "Male",
          birthdate: res.birthdate ? res.birthdate.slice(0, 10) : "",
          civil_status: res.civil_status ?? "Single",
          occupation: res.occupation ?? "",
          contact_number: res.contact_number ?? "",
          email: res.email ?? "",
          household_id: res.household_id ? String(res.household_id) : "",
          zone_purok: res.zone_purok ?? "Purok 1",
          residency_status: res.residency_status ?? "Permanent",
          length_of_residence_years: "",
          educational_attainment: "",
          demographic_classification: res.demographic_classification ?? "",
          is_active: res.is_active === false ? "0" : "1",
        });
      })
      .catch(() => setError("Could not load this resident."));
  }, [id]);

  const set = (key: keyof EditForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));

  // Selecting a household also fills the resident's Purok from that household.
  const selectHousehold = (household: Household | null) => {
    setSelectedHousehold(household);
    setForm((prev) =>
      prev
        ? {
            ...prev,
            household_id: household ? String(household.id) : "",
            zone_purok: household?.zone_purok || prev.zone_purok,
          }
        : prev
    );
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    if (!(await confirmAction({ title: "Save changes to this resident?", confirmText: "Yes, save" }))) return;
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        ...form,
        household_id: form.household_id ? Number(form.household_id) : null,
        demographic_classification: form.demographic_classification || null,
        is_active: form.is_active === "1",
      };
      ["length_of_residence_years", "educational_attainment"].forEach((k) => {
        if (payload[k] === "") delete payload[k];
      });
      await api.put(`/residents/${id}`, payload);
      navigate(`/residents/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const name = resident ? `${resident.first_name} ${resident.last_name}` : "Resident";

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Dashboard", to: "/dashboard" },
          { label: "Residents", to: "/residents" },
          { label: name, to: `/residents/${id}` },
          { label: "Edit Information" },
        ]}
      />
      <PageHeader
        title="Edit Resident Information"
        subtitle={resident ? `Resident No. ${resident.resident_number}` : "Updating resident record"}
        actions={
          <button
            type="button"
            onClick={() => navigate(`/residents/${id}`)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
          >
            <FiArrowLeft aria-hidden="true" /> Back
          </button>
        }
      />

      <Card>
        {error && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">{error}</p>
        )}
        {!form ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : (
          <form onSubmit={save} className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="First name" required>
              <input value={form.first_name} onChange={set("first_name")} required className={inputClasses} />
            </FormField>
            <FormField label="Middle name">
              <input value={form.middle_name} onChange={set("middle_name")} className={inputClasses} />
            </FormField>
            <FormField label="Last name" required>
              <input value={form.last_name} onChange={set("last_name")} required className={inputClasses} />
            </FormField>
            <FormField label="Suffix">
              <input value={form.suffix} onChange={set("suffix")} className={inputClasses} placeholder="Jr., Sr., III" />
            </FormField>
            <FormField label="Gender">
              <select value={form.gender} onChange={set("gender")} className={inputClasses}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </FormField>
            <FormField label="Birthdate">
              <input type="date" value={form.birthdate} onChange={set("birthdate")} className={inputClasses} />
            </FormField>
            <FormField label="Civil status">
              <select value={form.civil_status} onChange={set("civil_status")} className={inputClasses}>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
                <option>Separated</option>
              </select>
            </FormField>
            <FormField label="Occupation">
              <input value={form.occupation} onChange={set("occupation")} className={inputClasses} />
            </FormField>
            <FormField label="Contact number" hint="Philippine mobile — 10 digits after +63">
              <PhoneInput
                value={form.contact_number}
                onChange={(v) => setForm((prev) => (prev ? { ...prev, contact_number: v } : prev))}
              />
            </FormField>
            <FormField label="Email">
              <input type="email" value={form.email} onChange={set("email")} className={inputClasses} />
            </FormField>
            <FormField label="Household (Household No. / Address)" hint="Search to set the household, address & Purok">
              <HouseholdPicker value={form.household_id} selected={selectedHousehold} onSelect={selectHousehold} />
            </FormField>
            <FormField label="Zone / Purok">
              <select value={form.zone_purok} onChange={set("zone_purok")} className={inputClasses}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>Purok {n}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Residency status">
              <select value={form.residency_status} onChange={set("residency_status")} className={inputClasses}>
                <option>Permanent</option>
                <option>Temporary</option>
                <option>Migrant</option>
              </select>
            </FormField>
            <FormField label="Classification">
              <select value={form.demographic_classification} onChange={set("demographic_classification")} className={inputClasses}>
                <option value="">— None —</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Length of residence (years)">
              <input type="number" min="0" value={form.length_of_residence_years} onChange={set("length_of_residence_years")} className={inputClasses} placeholder="Leave blank to keep" />
            </FormField>
            <FormField label="Educational attainment">
              <input value={form.educational_attainment} onChange={set("educational_attainment")} className={inputClasses} placeholder="Leave blank to keep" />
            </FormField>
            <FormField label="Record status">
              <select value={form.is_active} onChange={set("is_active")} className={inputClasses}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </FormField>

            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/residents/${id}`)}
                className="cursor-pointer rounded-full border border-gray px-6 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
