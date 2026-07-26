import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import PhoneInput from "../../components/UI/PhoneInput";
import type { Household } from "../../types";

/** "HH-2026-0003 · Purok 3 · Owner: Juan Dela Cruz" */
function householdLabel(h: Household): string {
  const owner = h.head ? `${h.head.first_name} ${h.head.last_name}` : "no owner set";
  return `${h.household_number} · ${h.zone_purok ?? "—"} · Owner: ${owner}`;
}

const INITIAL = {
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  gender: "Male",
  birthdate: "",
  civil_status: "Single",
  occupation: "",
  contact_number: "",
  email: "",
  household_id: "",
  zone_purok: "Purok 1",
  residency_status: "Permanent",
  length_of_residence_years: "",
  educational_attainment: "",
  demographic_classification: "",
};

const CLASSIFICATIONS = ["Senior Citizen", "PWD", "Solo Parent", "Youth", "Child", "Others"];

export default function ResidentCreate() {
  const [form, setForm] = useState(INITIAL);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/residents/household-options")
      .then((r) => setHouseholds(r.data.data ?? []))
      .catch(() => undefined);
  }, []);

  const set = (key: keyof typeof INITIAL) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Selecting a household also fills the resident's Purok from that household.
  const selectHousehold = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const household = households.find((h) => String(h.id) === id);
    setForm((prev) => ({
      ...prev,
      household_id: id,
      zone_purok: household?.zone_purok || prev.zone_purok,
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, value]) => value !== "")
      );
      const response = await api.post("/residents", payload);
      navigate(`/residents/${response.data.data.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Register Resident"
        subtitle="Creates a record in the shared resident master registry"
      />

      <Card className="max-w-3xl">
        {error && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">{error}</p>
        )}
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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
          <FormField label="Gender" required>
            <select value={form.gender} onChange={set("gender")} className={inputClasses}>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </FormField>
          <FormField label="Birthdate" required>
            <input type="date" value={form.birthdate} onChange={set("birthdate")} required className={inputClasses} />
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
              onChange={(v) => setForm((prev) => ({ ...prev, contact_number: v }))}
            />
          </FormField>
          <FormField label="Email">
            <input type="email" value={form.email} onChange={set("email")} className={inputClasses} />
          </FormField>
          <FormField label="Household (Household No.)" hint="Sets the address & Purok. Type the HH number to jump.">
            <select value={form.household_id} onChange={selectHousehold} className={inputClasses}>
              <option value="">— No household —</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {householdLabel(h)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Zone / Purok" required>
            <select value={form.zone_purok} onChange={set("zone_purok")} className={inputClasses}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>Purok {n}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Residency status" required>
            <select value={form.residency_status} onChange={set("residency_status")} className={inputClasses}>
              <option>Permanent</option>
              <option>Temporary</option>
              <option>Migrant</option>
            </select>
          </FormField>
          <FormField label="Length of residence (years)">
            <input type="number" min="0" value={form.length_of_residence_years} onChange={set("length_of_residence_years")} className={inputClasses} />
          </FormField>
          <FormField label="Educational attainment">
            <input
              value={form.educational_attainment}
              onChange={set("educational_attainment")}
              className={inputClasses}
              placeholder="e.g. High School Graduate"
            />
          </FormField>
          <FormField label="Classification" hint="Sectoral / demographic tag">
            <select value={form.demographic_classification} onChange={set("demographic_classification")} className={inputClasses}>
              <option value="">— None —</option>
              {CLASSIFICATIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </FormField>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Register resident"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
