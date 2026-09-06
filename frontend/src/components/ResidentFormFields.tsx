import type { ReactNode } from "react";
import FormField, { inputClasses } from "./UI/FormField";
import PhoneInput from "./UI/PhoneInput";
import HouseholdPicker from "./UI/HouseholdPicker";
import { MANUAL_SECTORS } from "../lib/sectors";
import type { Household } from "../types";

/**
 * The resident registration form, as fields only.
 *
 * It lives here rather than inside the Register Resident page because a
 * parent, child or spouse added from someone's profile is a FULL resident
 * record — same fields, same rules, same portal account. Sharing the form is
 * what keeps that true: a field added for registration is a field the family
 * forms ask for too, with no second copy to forget about.
 */

export interface ResidentForm {
  first_name: string;
  middle_name: string;
  mother_maiden_name: string;
  last_name: string;
  suffix: string;
  gender: string;
  birthdate: string;
  birth_place: string;
  civil_status: string;
  occupation: string;
  contact_number: string;
  email: string;
  household_id: string;
  zone_purok: string;
  residency_status: string;
  length_of_residence_years: string;
  educational_attainment: string;
  /** Only used for someone who lives outside the barangay. */
  address: string;
}

export const RESIDENT_FORM_INITIAL: ResidentForm = {
  first_name: "",
  middle_name: "",
  mother_maiden_name: "",
  last_name: "",
  suffix: "",
  /*
   * Sex, civil status, purok and residency start EMPTY on purpose. A default
   * here is a guess that gets saved as fact the moment the clerk does not
   * notice it — every girl becomes Male, every widow Single, every migrant
   * Permanent. Making them choose costs one click and is the difference
   * between a register and a pile of defaults.
   */
  gender: "",
  birthdate: "",
  birth_place: "",
  civil_status: "",
  occupation: "",
  contact_number: "",
  email: "",
  household_id: "",
  zone_purok: "",
  residency_status: "",
  length_of_residence_years: "",
  educational_attainment: "",
  address: "",
};

/** Whole-year age from a YYYY-MM-DD birthdate. */
export function ageFromBirthdate(birthdate: string): number | null {
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
export function ageSectors(age: number | null): string[] {
  if (age === null) return [];
  if (age <= 14) return ["Child"];
  if (age <= 17) return ["Child", "Youth"];
  if (age <= 30) return ["Youth"];
  if (age <= 59) return ["Adult"];
  return ["Senior Citizen"];
}

/** Single value stored in the classification column (the primary bracket). */
export function primaryClassification(age: number | null): string | null {
  if (age === null) return null;
  if (age <= 14) return "Child";
  if (age <= 30) return "Youth"; // 15–30
  if (age <= 59) return "Adult";
  return "Senior Citizen";
}

/**
 * Turns the form state into the request body: empty strings dropped, the
 * classification derived from age, and the sector list assembled from the
 * age brackets plus whatever was toggled by hand.
 */
export function buildResidentPayload(
  form: ResidentForm,
  manualSectors: string[],
  autoLength: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = Object.fromEntries(
    Object.entries(form).filter(([, value]) => value !== "")
  );

  const age = ageFromBirthdate(form.birthdate);
  const primary = primaryClassification(age);
  if (primary) payload.demographic_classification = primary;
  payload.sectors = [...ageSectors(age), ...manualSectors];

  // "Same as age" overrides the length field with the current age.
  if (autoLength) {
    if (age !== null) payload.length_of_residence_years = age;
    else delete payload.length_of_residence_years;
  }

  return payload;
}

interface Props {
  form: ResidentForm;
  /** Patch-style so callers never have to spread the whole object. */
  onChange: (patch: Partial<ResidentForm>) => void;
  manualSectors: string[];
  onToggleSector: (sector: string) => void;
  autoLength: boolean;
  onAutoLengthChange: (value: boolean) => void;
  selectedHousehold: Household | null;
  onSelectHousehold: (household: Household | null) => void;
  onAddNewHousehold?: () => void;
  /** Rendered under the household field — the "set as owner" opt-in. */
  householdExtra?: ReactNode;
  /** Explains why the household/purok arrived pre-filled, on family forms. */
  householdHint?: string;
  /**
   * The mother's maiden name is what tells two people with the same name AND
   * birthday apart, so registration asks for it. The family forms do not: the
   * mother is being named on the same screen, which makes it both redundant
   * and one more field between the clerk and the four they actually need.
   */
  /**
   * The family forms ask where the person lives in their own step, with a
   * picker of their own. Leaving this one on would put TWO household pickers
   * on the same screen, disagreeing with each other.
   */
  showHousehold?: boolean;
}

export default function ResidentFormFields({
  form,
  onChange,
  manualSectors,
  onToggleSector,
  autoLength,
  onAutoLengthChange,
  selectedHousehold,
  onSelectHousehold,
  onAddNewHousehold,
  householdExtra,
  householdHint,
  showHousehold = true,
}: Props) {
  const set =
    (key: keyof ResidentForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value } as Partial<ResidentForm>);

  /*
   * The purok the chosen household sits in. When there is one it decides the
   * field below, so the person and their house can never disagree.
   */
  const purokFromHousehold = selectedHousehold?.zone_purok ?? null;

  // Age-based sectors, recomputed live from the birthdate.
  const age = ageFromBirthdate(form.birthdate);
  const autoSectors = ageSectors(age);

  return (
    <>
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
        <select value={form.gender} onChange={set("gender")} required className={inputClasses}>
          <option value="">Select…</option>
          <option>Male</option>
          <option>Female</option>
          <option>Other</option>
        </select>
      </FormField>
      <FormField label="Birthdate" required>
        <input type="date" value={form.birthdate} onChange={set("birthdate")} required className={inputClasses} />
      </FormField>
      <FormField label="Place of birth" hint="Also on the PSA birth certificate.">
        <input
          value={form.birth_place}
          onChange={set("birth_place")}
          className={inputClasses}
          placeholder="e.g. Tagoloan, Misamis Oriental"
        />
      </FormField>
      <FormField label="Civil status">
        <select value={form.civil_status} onChange={set("civil_status")} className={inputClasses}>
          <option value="">Not recorded</option>
          <option>Single</option>
          <option>Married</option>
          <option>Widowed</option>
          <option>Separated</option>
        </select>
      </FormField>
      <FormField label="Occupation">
<div>
          <input
            value={form.occupation || "Not set"}
            readOnly
            aria-label="Occupation"
            className={`${inputClasses} cursor-not-allowed bg-secondary text-gray-400`}
          />
          <p className="mt-1 text-xs text-gray-400">
            The resident sets this from their portal. Nobody at the counter knows what work
            somebody does better than they do.
          </p>
        </div>
      </FormField>
      <FormField label="Contact number" hint="Philippine mobile — 10 digits after +63">
        <PhoneInput
          value={form.contact_number}
          onChange={(v) => onChange({ contact_number: v })}
        />
      </FormField>
      <FormField
        label="Email"
        hint="Their portal login. Leave blank and no account is created."
      >
        <input type="email" value={form.email} onChange={set("email")} className={inputClasses} />
      </FormField>
      {showHousehold && (
        <FormField
          plain
          label="Household (Household No.)"
          hint={householdHint ?? "Search to set the address & Purok. Not listed? Register one."}
        >
          <HouseholdPicker
            value={form.household_id}
            selected={selectedHousehold}
            onSelect={onSelectHousehold}
            onAddNew={onAddNewHousehold}
          />
          {householdExtra}
        </FormField>
      )}
      {/*
        A purok belongs to the HOUSE, not to the person in it. Once a
        household is chosen its purok is the answer, and leaving the field
        open is how a resident ends up filed in Purok 3 while their house is
        in Purok 1.
      */}
      <FormField
        label="Zone / Purok"
        required
        hint={purokFromHousehold ? "From the chosen household — a purok belongs to the house." : undefined}
      >
        <select
          value={form.zone_purok}
          onChange={set("zone_purok")}
          required
          disabled={!!purokFromHousehold}
          className={`${inputClasses} ${purokFromHousehold ? "bg-secondary text-gray-500" : ""}`}
        >
          <option value="">Select…</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n}>Purok {n}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Residency status" required>
        <select
          value={form.residency_status}
          onChange={set("residency_status")}
          required
          className={inputClasses}
        >
          <option value="">Select…</option>
          <option>Permanent</option>
          <option>Temporary</option>
          <option>Migrant</option>
        </select>
      </FormField>
      <div className="block">
        <span className="mb-1.5 block text-sm font-medium text-dark">Length of residence (years)</span>
        <input
          type="number"
          min="0"
          value={autoLength ? age ?? "" : form.length_of_residence_years}
          onChange={set("length_of_residence_years")}
          disabled={autoLength}
          className={`${inputClasses} ${autoLength ? "bg-secondary text-gray-500" : ""}`}
        />
        <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={autoLength}
            onChange={(e) => onAutoLengthChange(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
          Same as age — auto-count from birthdate{age !== null ? ` (${age})` : ""}
        </label>
      </div>
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
                  onClick={() => onToggleSector(sector)}
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
    </>
  );
}
