import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import Breadcrumbs from "../../components/UI/Breadcrumbs";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import PhoneInput from "../../components/UI/PhoneInput";
import HouseholdPicker from "../../components/UI/HouseholdPicker";
import type { Household } from "../../types";

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
};

/** Sectors the clerk toggles manually (not derived from age). */
const MANUAL_SECTORS = [
  "Solo Parent",
  "PWD",
  "4Ps Household",
  "Pregnant Women",
  "Indigent",
  "Unemployed",
  "Out-of-School Youth",
  "Farmer / Fisherfolk",
];

/** Whole-year age from a YYYY-MM-DD birthdate. */
function ageFromBirthdate(birthdate: string): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

/**
 * Age-based sectors (a person can fall in more than one):
 *   0–14 Child · 15–17 Child + Youth · 18–30 Youth · 31–59 Adult · 60+ Senior.
 */
function ageSectors(age: number | null): string[] {
  if (age === null) return [];
  if (age <= 14) return ["Child"];
  if (age <= 17) return ["Child", "Youth"];
  if (age <= 30) return ["Youth"];
  if (age <= 59) return ["Adult"];
  return ["Senior Citizen"];
}

/** Single value stored in the classification column (the primary bracket). */
function primaryClassification(age: number | null): string | null {
  if (age === null) return null;
  if (age <= 14) return "Child";
  if (age <= 30) return "Youth"; // 15–30
  if (age <= 59) return "Adult";
  return "Senior Citizen";
}

const NEW_HH_INITIAL = { household_number: "", zone_purok: "Purok 1", street_address: "", house_type: "" };

export default function ResidentCreate() {
  const [form, setForm] = useState(INITIAL);
  const [manualSectors, setManualSectors] = useState<string[]>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Inline "register household" so the clerk doesn't have to leave the form.
  const [hhOpen, setHhOpen] = useState(false);
  const [hhForm, setHhForm] = useState(NEW_HH_INITIAL);
  const [hhError, setHhError] = useState("");
  const [hhSaving, setHhSaving] = useState(false);
  const navigate = useNavigate();

  const setHh = (key: keyof typeof NEW_HH_INITIAL) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setHhForm((prev) => ({ ...prev, [key]: e.target.value }));

  const saveHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Register this household?", confirmText: "Yes, register" }))) return;
    setHhSaving(true);
    setHhError("");
    try {
      const response = await api.post("/population/households", hhForm);
      const created: Household = response.data.data;
      // Select the new household and fill the resident's Purok from it.
      setSelectedHousehold(created);
      setForm((prev) => ({
        ...prev,
        household_id: String(created.id),
        zone_purok: created.zone_purok || prev.zone_purok,
      }));
      setHhOpen(false);
      setHhForm(NEW_HH_INITIAL);
    } catch (err) {
      setHhError(errorMessage(err));
    } finally {
      setHhSaving(false);
    }
  };

  const set = (key: keyof typeof INITIAL) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Selecting a household also fills the resident's Purok from that household.
  const selectHousehold = (household: Household | null) => {
    setSelectedHousehold(household);
    setForm((prev) => ({
      ...prev,
      household_id: household ? String(household.id) : "",
      zone_purok: household?.zone_purok || prev.zone_purok,
    }));
  };

  const toggleSector = (sector: string) =>
    setManualSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );

  // Age-based sectors, recomputed live from the birthdate.
  const age = ageFromBirthdate(form.birthdate);
  const autoSectors = ageSectors(age);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !(await confirmAction({
        title: "Register this resident?",
        text: `${form.first_name} ${form.last_name} will be added to the resident registry.`,
        confirmText: "Yes, register",
      }))
    )
      return;
    setError("");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = Object.fromEntries(
        Object.entries(form).filter(([, value]) => value !== "")
      );
      // Classification is derived from age; sectors = age-based + manual toggles.
      const primary = primaryClassification(age);
      if (primary) payload.demographic_classification = primary;
      payload.sectors = [...autoSectors, ...manualSectors];
      const response = await api.post("/residents", payload);
      navigate(`/residents/${response.data.data.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Dashboard", to: "/dashboard" },
          { label: "Residents", to: "/residents" },
          { label: "Register Resident" },
        ]}
      />
      <PageHeader
        title="Register Resident"
        subtitle="Creates a record in the shared resident master registry"
        actions={
          <button
            type="button"
            onClick={() => navigate("/residents")}
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
        {/* 3 columns on large screens so the whole form fits without scrolling */}
        <form onSubmit={submit} className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <FormField
            label="Household (Household No.)"
            hint="Search to set the address & Purok. Not listed? Register one."
          >
            <HouseholdPicker
              value={form.household_id}
              selected={selectedHousehold}
              onSelect={selectHousehold}
              onAddNew={() => setHhOpen(true)}
            />
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
          {/* Sectors / classification — age-based tag is automatic; the rest
              are quick toggle buttons. Spans the full form width. */}
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="mb-1.5 text-sm font-medium text-dark">Sectors / Classification</p>
            <div className="rounded-2xl border border-gray bg-secondary/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-gray-600">Age-based (automatic):</span>
                {autoSectors.length > 0 ? (
                  autoSectors.map((s) => (
                    <span key={s} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">Set a birthdate to detect</span>
                )}
              </div>
              <p className="mb-2 text-xs font-medium text-gray-500">
                Tap any that apply (you can pick more than one):
              </p>
              <div className="flex flex-wrap gap-2">
                {MANUAL_SECTORS.map((sector) => {
                  const on = manualSectors.includes(sector);
                  return (
                    <button
                      key={sector}
                      type="button"
                      onClick={() => toggleSector(sector)}
                      aria-pressed={on}
                      className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                        on
                          ? "border-primary bg-primary text-white"
                          : "border-gray bg-white text-dark hover:border-primary hover:text-primary"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {sector}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
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

      {/* Inline household registration */}
      <Modal open={hhOpen} onClose={() => setHhOpen(false)} title="Register Household">
        {hhError && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">{hhError}</p>
        )}
        <form onSubmit={saveHousehold} className="space-y-4">
          <FormField label="Household number" required>
            <input value={hhForm.household_number} onChange={setHh("household_number")} required className={inputClasses} placeholder="e.g. HH-2026-0012" />
          </FormField>
          <FormField label="Zone / Purok" required>
            <select value={hhForm.zone_purok} onChange={setHh("zone_purok")} className={inputClasses}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>Purok {n}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Street address" required>
            <input value={hhForm.street_address} onChange={setHh("street_address")} required className={inputClasses} />
          </FormField>
          <FormField label="House type">
            <input value={hhForm.house_type} onChange={setHh("house_type")} className={inputClasses} placeholder="e.g. Concrete, Semi-concrete" />
          </FormField>
          <button
            type="submit"
            disabled={hhSaving}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {hhSaving ? "Saving…" : "Register household & select it"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
