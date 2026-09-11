import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  FiPlus, FiX, FiArrowLeft, FiChevronDown, FiChevronRight,
  FiCheck, FiAlertTriangle, FiLoader,
} from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import StatusBadge from "../../components/UI/StatusBadge";
import FormField, { inputClasses } from "../../components/UI/FormField";
import PhoneInput from "../../components/UI/PhoneInput";
import Modal from "../../components/UI/Modal";
import type { Resident } from "../../types";

/**
 * The RBIM baseline census form.
 *
 * The paper is a wide grid — ten people across nine spreads, carried by line
 * number. That is right for a clipboard and wrong for a screen: forty-four
 * columns cannot be read at once on anything, and an encoder scrolling
 * sideways loses which row they are on.
 *
 * So each person is a card, and the card is divided the way the paper is
 * divided. The sections collapse because most of them do not apply to most
 * people: a nine-year-old has no economic activity, a man has no family
 * planning answers, and a non-migrant has no migration story. Showing all
 * forty-four for everybody is how an encoder starts skipping.
 */

type Codes = Record<string, Record<string, string>>;

/** What the household-number check answers. */
interface HouseCheck {
  exists: boolean;
  household_number?: string;
  census?: {
    id: number;
    census_no: string;
    status: string;
    household_head_name: string;
    members_count: number;
  };
  household?: {
    id: number;
    household_number: string;
    zone_purok?: string | null;
    street_address?: string | null;
    head?: { id: number; first_name: string; last_name: string } | null;
  };
  residents?: {
    id: number;
    resident_number: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    gender?: string | null;
    birthdate?: string | null;
  }[];
  resident_count?: number;
  censuses?: {
    id: number;
    census_no: string;
    status: string;
    members_count: number;
    household_head_name: string;
  }[];
}

/** Anything a household-level box can hold, lists included. */
type FormValue = string | number | boolean | null | string[] | DeathRow[];

/** One death on the Q54 or Q55 list. Ages are typed, so they stay strings. */
interface DeathRow {
  age?: string | null;
  sex?: string | null;
  cause?: string | null;
}

interface Member {
  [key: string]: string | number | null | undefined;
  last_name: string;
  first_name: string;
  middle_name: string;
}

const BLANK_MEMBER: Member = { last_name: "", first_name: "", middle_name: "" };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The years a living person could have been born in.
 *
 * Newest first: a census records far more thirty-year-olds than
 * hundred-year-olds, and a list that opens at 1906 makes the common case the
 * longest scroll.
 */
const BIRTH_YEARS = Array.from(
  { length: 120 },
  (_, i) => new Date().getFullYear() - i
);

/**
 * The form's own skip code.
 *
 * Printed in the margin — "For SKIPPED questions, write 99" — and then said
 * precisely: Q11 is 99 below five, Q12 to Q14 are 99 below three and at
 * twenty-five and over. It means "asked, does not apply", which is a
 * different answer from a box nobody filled in.
 */
const SKIPPED = "99";

/**
 * Where this register is.
 *
 * Named once. The three address boxes are read-only on the form, so a form
 * that arrived without them would show three blanks nobody could fix.
 */
const PUROKS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5"];

/**
 * What Q32 fills in when the tick says "registered here".
 *
 * Spelled once. Ten lines typing it by hand is ten chances to spell it
 * differently, and a search for voters in this barangay finds nine of them.
 */
const VOTER_HERE = "Barangay Natumolan";

const HOME = {
  province: "Misamis Oriental",
  city_municipality: "Tagoloan",
  barangay: "Natumolan",
};

/**
 * Whether the chosen code is the list's "Others" entry.
 *
 * Read from the list itself rather than hard-coded: the code differs per
 * question — 5 for lighting fuel, 6 for cooking, 12 for water, 18 for skills
 * — and a table of magic numbers here would drift from the model that owns
 * them.
 */
/**
 * A whole number, capped by the code rather than by the browser.
 *
 * `maxLength` does nothing at all on `<input type="number">` — which is why
 * a three-digit age box happily took seven digits. So numeric boxes are text
 * boxes in numeric mode, and the cap is applied where it can be trusted.
 */
function onlyDigits(raw: unknown, cap: number): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, cap);
}

/** 5000 into 5,000. Below a thousand there is nothing to group. */
function groupThousands(raw: unknown): string {
  // A decimal column reads back as "5000.00"; the pesos are what was typed.
  const whole = String(raw ?? "").split(".")[0].replace(/\D/g, "");

  return whole === "" ? "" : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** MM/YYYY, with the slash put in as it is typed. */
function maskMonthYear(raw: string): string {
  const only = raw.replace(/\D/g, "").slice(0, 6);

  return only.length <= 2 ? only : `${only.slice(0, 2)}/${only.slice(2)}`;
}

/** Two columns — a month and a year — read as one box. */
function joinMonthYear(month: unknown, year: unknown): string {
  const m = month === null || month === undefined || month === "" ? "" : String(month);
  const y = year === null || year === undefined || year === "" ? "" : String(year);

  if (!m && !y) return "";
  if (!y) return m.padStart(2, "0");

  return `${m.padStart(2, "0")}/${y}`;
}

function splitMonthYear(text: string): { month: string; year: string } {
  const only = text.replace(/\D/g, "");
  const month = only.slice(0, 2);

  return {
    // A month of 00 is nobody's month; it is half of a keystroke.
    month: month === "" || Number(month) === 0 ? "" : String(Number(month)),
    year: only.slice(2, 6),
  };
}

/**
 * Q16 says the income did not come from work, so Q17 and Q18 are skipped.
 *
 * Remittance, investments and "others" are money without a job — the paper
 * sends all three straight to Q19. The three codes are named because the
 * paper names them; this list is fixed by the form, not by us.
 */
function skipsToQ19(member: Member): boolean {
  return ["3", "4", "5"].includes(String(member.q16_income_source ?? ""));
}

/**
 * Q36, which the paper says to work out rather than ask.
 *
 *   Non-migrant  Q33 and Q34 are both this barangay.
 *   Migrant      either is somewhere else, and Q35 is at least six months
 *                and one day.
 *   Transient    either is somewhere else, and Q35 is under six months.
 *
 * The two residences are free text, so "this barangay" is read by name.
 * Anything the form cannot decide it leaves alone — a wrong code here sends
 * eight migration questions to 99 for somebody who should have answered
 * them, which is worse than an empty box.
 */
function residentTypeFrom(member: Member): string | null {
  const five = String(member.q33_residence_5yrs ?? "").trim();
  const six = String(member.q34_residence_6mos ?? "").trim();

  if (!five || !six) return null;

  const here = (place: string) =>
    new RegExp(HOME.barangay, "i").test(place.replace(/[^A-Za-z0-9 ]/g, " "));

  if (here(five) && here(six)) return "1";

  const years = Number(member.q35_stay_years ?? 0) || 0;
  const months = Number(member.q35_stay_months ?? 0) || 0;

  if (!member.q35_stay_years && !member.q35_stay_months) return null;

  // "At least six months and one day" — six months exactly is still transient.
  return years * 12 + months > 6 ? "2" : "3";
}

/** Q36 says non-migrant, so Q37 to Q41 are not asked of this person. */
function isNonMigrant(member: Member): boolean {
  return String(member.q36_resident_type ?? residentTypeFrom(member) ?? "") === "1";
}

/**
 * A code already used in the A box cannot be the answer in B as well.
 *
 * Q38 and Q40 each ask for up to three DIFFERENT reasons. Offering the same
 * fifteen in all three boxes is how a form comes back saying somebody left
 * for lack of employment, lack of employment, and lack of employment.
 */
function without(
  list: Record<string, string> | undefined,
  taken: (string | number | null | undefined)[]
): Record<string, string> {
  const used = taken.filter((v) => v !== null && v !== undefined && v !== "").map(String);

  return Object.fromEntries(
    Object.entries(list ?? {}).filter(([code]) => !used.includes(code))
  );
}

function isOther(value: unknown, list?: Record<string, string>): boolean {
  if (value === null || value === undefined || value === "") return false;

  return /^other/i.test(list?.[String(value)] ?? "");
}

/**
 * One letter, written the way an initial is written.
 *
 * "l", "L" and "L." are the same answer; which of them the register ends up
 * holding should not depend on whether the encoder reached for the full stop.
 * An empty box stays empty — plenty of people have no middle name, and "."
 * on its own is not one.
 */
function asInitial(typed: string): string {
  const letter = typed.replace(/[^A-Za-zÑñ]/g, "").slice(0, 1).toUpperCase();

  return letter === "" ? "" : `${letter}.`;
}

/**
 * "Dela Cruz, Juan R." into its three parts.
 *
 * The form asks for the head as "Last Name, First Name M.I." and then asks
 * for the same person again on line 1 — the head is always line 1, that is
 * what Q2 code 01 means. Typing the name twice is two chances to spell it
 * differently, and the two spellings then belong to two different people as
 * far as anything reading them is concerned.
 *
 * The comma is what the form itself uses to separate the surname, so it is
 * what is read. Everything after the first comma is given names; the last
 * word of those is taken as the middle initial only when it looks like one —
 * "Juan R." gives R., while "Juan Miguel" is left whole, because a second
 * given name is not an initial.
 */
function splitHeadName(full: string): { last: string; first: string; middle: string } {
  const [surname, ...rest] = full.split(",");
  const given = rest.join(",").trim();

  if (!given) {
    return { last: surname.trim(), first: "", middle: "" };
  }

  const words = given.split(/\s+/).filter(Boolean);
  const tail = words[words.length - 1] ?? "";

  // An initial: one letter, optionally with a full stop.
  const isInitial = words.length > 1 && /^[A-Za-zÑñ]\.?$/.test(tail);

  return {
    last: surname.trim(),
    first: (isInitial ? words.slice(0, -1) : words).join(" "),
    /*
     * Upper-cased and given its full stop, because line 1 shows it read-only:
     * whatever this returns is what the register carries, and nobody
     * downstream can correct it by hand.
     */
    middle: isInitial ? `${tail.replace(/\.$/, "").toUpperCase()}.` : "",
  };
}

/**
 * Age at last birthday, from a birth month and year.
 *
 * The census asks for a month and a year and no day, so the turn-over is put
 * at the END of the birth month: somebody born in June is 32 for all of June
 * and 33 from July. That is the safe direction to be wrong in — it never
 * makes anybody older than they are, so nobody reaches a senior citizen's
 * entitlement or passes a youth programme's cut-off a month early.
 *
 * Derived rather than typed, so it is right tomorrow as well as today. An age
 * written into a box is a fact about the day it was written.
 */
function ageFromMonthYear(month: unknown, year: unknown): number | null {
  const m = Number(month);
  const y = Number(year);

  if (!m || !y || m < 1 || m > 12 || y < 1900) return null;

  const now = new Date();
  const monthsElapsed = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);

  // A month and year still ahead of us is a mis-typed line, not a person.
  if (monthsElapsed < 0) return null;

  const age = now.getFullYear() - y - (now.getMonth() + 1 <= m ? 1 : 0);

  /*
   * Clamped, for the newborn. A baby born THIS month has no completed year
   * and comes out of the sum as -1; they are 0, and a blank age box on the
   * one line most likely to need a health visit is the worst place for this
   * to go quiet.
   */
  return Math.max(age, 0);
}

/** Age at last birthday, the way Q4 asks for it. */
function ageFrom(birthdate?: string | null): number | null {
  if (!birthdate) return null;

  const born = new Date(birthdate);
  if (Number.isNaN(born.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();

  // "At last birthday" — not yet had it this year means one less.
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;

  return age >= 0 ? age : null;
}

/** Whether an age puts a question outside the band the form asks it in. */
/**
 * Is this box answered?
 *
 * 0 and 99 are answers — "no income" and "does not apply" are both things a
 * household said. Only an empty box is unanswered.
 */
function answered(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

/**
 * How far through a section this line is.
 *
 * The list is written at the call site as the section's own questions, with
 * a conditional one dropped in as `condition && "key"` — so what is counted
 * sits beside what is rendered and the two cannot quietly drift apart.
 *
 * A question this person should not be asked is not counted, in the
 * numerator or the denominator. Counting them would leave every adult stuck
 * at "Infant health 0/5" for good, which reads as broken and is the surest
 * way to teach an encoder to start inventing answers to clear it.
 */
function progressOf(keys: (string | false | null | undefined)[], member: Member) {
  const asked = keys.filter(Boolean) as string[];

  return {
    total: asked.length,
    filled: asked.filter((key) => answered(member[key])).length,
  };
}

/** The inverse of `outOfBand`: an unknown age cannot be ruled out of anything. */
function inBand(age: unknown, min: number, max?: number): boolean {
  return !outOfBand(age, min, max);
}

/**
 * How old this line is, as the form should read it.
 *
 * Q5 first, always: a month and a year is what the census collects, and Q4
 * is that arithmetic — which is why Q4 goes read-only the moment Q5 is
 * answered. A read-only box has no onChange, so `q4_age` is never written to
 * state, and every band that asked the box was asking an empty value.
 *
 * The typed number is still the fallback, for a line where the office knows
 * the age and not the birth month.
 */
function ageOf(member: Member): number | null {
  const derived = ageFromMonthYear(member.q5_birth_month, member.q5_birth_year);
  if (derived !== null) return derived;

  const typed = member.q4_age;
  if (typed === null || typed === undefined || typed === "") return null;

  const n = Number(typed);

  return Number.isNaN(n) ? null : n;
}

/**
 * Family planning is asked of women 10 to 54.
 *
 * An unanswered Q3 counts as applicable. Hiding a whole section because one
 * earlier box is still blank is how a section gets skipped for good.
 */
function maybeWoman(member: Member, sexes?: Record<string, string>): boolean {
  const label = sexes?.[String(member.q3_sex ?? "")] ?? "";

  return label === "" || /female|babae/i.test(label);
}

/**
 * Are Q13 and Q14 still being asked?
 *
 * The paper prints "FOR 3-24 YEARS OLD" over Q12–Q14 and its notes say to
 * write 99 from twenty-five up. That upper bound is not kept here, because
 * it is not true: people go back to school at any age — ALS, a degree
 * finished late, a senior citizen enrolled — and a locked box would make the
 * form record a 99 that the household would say is wrong.
 *
 * What is kept is Q12's own instruction, printed on the same page: "If No,
 * SKIP to Q15". So Q13 and Q14 follow the answer to Q12 rather than a
 * birthday. That is both what the form says and what is actually so — a
 * person not enrolled has no school level and no place of school, whether
 * they are nine or ninety.
 *
 * An unanswered Q12 leaves them open. A blank box is not a No.
 */
function schoolDetailsApply(member: Member): boolean {
  if (outOfBand(ageOf(member), 3)) return false;

  const enrolled = String(member.q12_enrolled ?? "");

  return enrolled === "" || enrolled === "1" || enrolled === "2";
}

function outOfBand(age: unknown, min: number, max?: number): boolean {
  const n = Number(age);
  if (age === null || age === undefined || age === "" || Number.isNaN(n)) return false;

  return n < min || (max !== undefined && n > max);
}

/**
 * A labelled select over one of the form's numbered code lists.
 *
 * `skipped` is the case where the question was asked and does not apply —
 * an age band, or an earlier answer that the paper skips forward from. The
 * paper records that as 99, so the box is locked and says so, rather than
 * being left open for an encoder to answer something that cannot be true.
 */
function Coded({
  label,
  list,
  value,
  onChange,
  hint,
  neededToRegister = false,
  skipped = false,
  skippedNote,
  lockedTo,
  lockedNote,
}: {
  label: string;
  list?: Record<string, string>;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  hint?: string;
  /**
   * Starred, but not enforced by the browser.
   *
   * These are what REGISTERING needs, and a draft is allowed to be
   * half-finished — the whole point of the state. Marking them with the
   * browser's own `required` would block Save as draft, so the star says
   * what will be wanted and the check before submitting is what insists.
   */
  neededToRegister?: boolean;
  skipped?: boolean;
  skippedNote?: string;
  /**
   * Pinned to one code because the answer is not in question — Q2 on line 1
   * is Head, and nothing about the form can make it otherwise.
   */
  lockedTo?: string | number;
  lockedNote?: string;
}) {
  const pinned = lockedTo !== undefined;

  return (
    <FormField
      label={label}
      required={neededToRegister}
      hint={pinned ? lockedNote : skipped ? skippedNote : hint}
    >
      <select
        value={pinned ? String(lockedTo) : skipped ? SKIPPED : (value ?? "")}
        disabled={skipped || pinned}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClasses} ${
          skipped || pinned ? "cursor-not-allowed bg-secondary text-gray-400" : ""
        }`}
      >
        <option value="">—</option>
        {skipped && <option value={SKIPPED}>99 · Not applicable at this age</option>}
        {Object.entries(list ?? {}).map(([code, text]) => (
          <option key={code} value={code}>
            {code} · {text}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/** A plain dropdown over values that are not one of the form's code lists. */
function Choice({
  label,
  options,
  value,
  onChange,
  hint,
  neededToRegister = false,
  placeholder = "—",
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  hint?: string;
  /** Starred but not browser-enforced — see the note on Coded. */
  neededToRegister?: boolean;
  placeholder?: string;
}) {
  return (
    <FormField label={label} required={neededToRegister} hint={hint}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/**
 * How many characters are left in a box.
 *
 * A cap the browser enforces on its own is the quietest failure on the form:
 * the letters simply stop appearing. Nothing is flagged, nothing is wrong to
 * look at, and the address that gets saved is cut off in the middle with
 * nobody the wiser.
 *
 * Shown only once there is something typed — thirty boxes each announcing
 * "80 characters left" over an empty form is noise — and only on boxes long
 * enough for the number to be worth reading. A middle initial does not need
 * a countdown.
 *
 * Deliberately NOT a live region. It changes on every keystroke, and a screen
 * reader announcing a new number after each letter is unusable; the input
 * carries its own maxLength, which is what assistive software reads.
 */
function charsLeft(
  value: unknown,
  max?: number
): { text: string; tone: "quiet" | "tight" | "full" } | null {
  /* Too short for a countdown to be worth reading. A middle initial does not
     need one, and neither does a two-digit month. */
  if (!max || max < 20) return null;

  const used = String(value ?? "").length;

  /* Nothing typed, nothing to say. Thirty boxes each announcing "80
     characters left" over an empty form is noise, not help. */
  if (used === 0) return null;

  const left = max - used;

  if (left <= 0) {
    return { text: `Full — ${max} characters is the most this box takes`, tone: "full" };
  }

  /* Tight is the last fifth, or the last ten — whichever is more room. */
  const tight = Math.max(10, Math.round(max * 0.2));

  return {
    text: `${left} character${left === 1 ? "" : "s"} left`,
    tone: left <= tight ? "tight" : "quiet",
  };
}

const CHARS_LEFT_TONE = {
  quiet: "text-gray-400",
  tight: "font-medium text-amber-700",
  full: "font-semibold text-danger",
} as const;

function CharsLeft({ value, max }: { value: unknown; max?: number }) {
  const said = charsLeft(value, max);
  if (!said) return null;

  return (
    <span className={`mt-1 block text-right text-[11px] ${CHARS_LEFT_TONE[said.tone]}`}>
      {said.text}
    </span>
  );
}

/**
 * A text box that can be switched off.
 *
 * Two cases need that, and they are the same case: a box whose question does
 * not apply. "If not Filipino" is dead while the answer is Filipino, and
 * "Others, please specify" is dead until Others is chosen. Leaving them open
 * invites an answer that contradicts the one beside it.
 */
function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  required = false,
  disabled = false,
  disabledNote,
  maxLength,
  uppercase = false,
  readOnly = false,
  digits,
  max,
  money = false,
  prefix,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  disabledNote?: string;
  maxLength?: number;
  /** For an initial: what is typed is what is stored, in one case. */
  uppercase?: boolean;
  /**
   * Shown but not editable — for a value that is genuinely typed somewhere
   * else. Not `disabled`: a disabled input is skipped by the browser's own
   * required-check, and these still have to be filled.
   */
  readOnly?: boolean;
  /** Digits only, and no more than this many of them. */
  digits?: number;
  /** The largest value the box will accept — 11 months, 12 pregnancies. */
  max?: number;
  /** Grouped in thousands as it is typed; bare digits are what is stored. */
  money?: boolean;
  /** Fixed text inside the field, ahead of the value — "+63", "₱". */
  prefix?: string;
}) {
  /*
    A number box is a text box in numeric mode.

    `type="number"` was the obvious choice and the wrong one: the browser
    ignores maxLength on it entirely, which is why a three-digit age box took
    seven digits happily. Its spinner arrows are a nuisance on a grid this
    dense, and a stray scroll over a focused one changes the value.
  */
  const numeric = digits !== undefined || money;

  const shown = disabled ? "" : money ? groupThousands(value) : (value ?? "");

  const handle = (raw: string) => {
    if (!numeric) {
      onChange(uppercase ? raw.toUpperCase() : raw);
      return;
    }

    const only = onlyDigits(raw, digits ?? 12);

    // Out of range is REJECTED, not clamped: typing 12 into a 0-11 box
    // leaves the 1 that was already there rather than silently becoming 11.
    if (only !== "" && max !== undefined && Number(only) > max) return;

    onChange(only);
  };

  return (
    <FormField label={label} hint={disabled ? (disabledNote ?? hint) : hint} required={required}>
      <span className="relative block">
        {prefix && !disabled && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-medium text-gray-500">
            {prefix}
          </span>
        )}
        <input
          type={numeric ? "text" : type}
          inputMode={numeric ? "numeric" : undefined}
          value={shown}
          maxLength={money ? undefined : maxLength}
          onChange={(e) => handle(e.target.value)}
          placeholder={disabled ? "" : placeholder}
          required={required && !disabled}
          disabled={disabled}
          readOnly={readOnly}
          style={prefix ? { paddingLeft: 14 + prefix.length * 9 } : undefined}
          /*
            One look for every box that cannot be typed in.

            Disabled and read-only are different to the browser and identical
            to the person: both mean "not yours to change here". Two shades of
            grey for one meaning just makes the clerk wonder which is which.
          */
          className={`${inputClasses} ${
            disabled || readOnly ? "cursor-not-allowed bg-secondary text-gray-400" : ""
          }`}
        />
      </span>

      {/* A box nobody can type in cannot run out of room. */}
      {!disabled && !readOnly && <CharsLeft value={value} max={money ? undefined : maxLength} />}
    </FormField>
  );
}

/**
 * A month and a year, and nothing finer.
 *
 * The paper asks for exactly that - "write the month in the upper triangle
 * and the year in the lower" - and asking for a day the household was never
 * asked invents a fact. Two boxes side by side let the year be filled and the
 * month forgotten; one box cannot half-answer.
 */
function MonthYear({
  label,
  value,
  onChange,
  hint,
  disabled = false,
  disabledNote,
  skipped = false,
  skippedNote,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
  disabledNote?: string;
  /** Shows the form's own 99 rather than a blank, for a question not asked. */
  skipped?: boolean;
  skippedNote?: string;
}) {
  const off = disabled || skipped;
  const complete = /^(0[1-9]|1[0-2])\/\d{4}$/.test(value);
  const wrong = !off && value !== "" && !complete;

  return (
    <FormField
      label={label}
      hint={
        skipped
          ? (skippedNote ?? "99 - not asked.")
          : disabled
            ? (disabledNote ?? hint)
            : wrong
              ? "Month and year - 03/2024. The month is 01 to 12."
              : hint
      }
    >
      <input
        type="text"
        inputMode="numeric"
        placeholder={off ? "" : "MM/YYYY"}
        maxLength={7}
        value={skipped ? SKIPPED : off ? "" : value}
        disabled={off}
        onChange={(e) => onChange(maskMonthYear(e.target.value))}
        className={`${inputClasses} ${
          off ? "cursor-not-allowed bg-secondary text-gray-400" : ""
        } ${wrong ? "border-warning" : ""}`}
      />
    </FormField>
  );
}

/**
 * Q32, where the answer is nearly always this barangay.
 *
 * Typing "Barangay Natumolan" onto every one of ten lines is ten chances to
 * spell it differently, and the tenth is the one that fails a search later.
 * The tick fills it; unticked, the box is open for somebody registered
 * elsewhere. Unticked is the default, because a form that assumes an answer
 * is a form that collects assumptions.
 */
function VoterField({
  value,
  onChange,
  disabled = false,
  disabledNote,
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const here = String(value ?? "") === VOTER_HERE;

  return (
    <FormField
      plain
      label="Q32 Registered voter in"
      hint={disabled ? disabledNote : "15 and above - the barangay they are registered in."}
    >
      <input
        type="text"
        maxLength={30}
        value={disabled ? "" : (value ?? "")}
        readOnly={here}
        disabled={disabled}
        placeholder={disabled ? "" : "Barangay and municipality"}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClasses} ${
          disabled || here ? "cursor-not-allowed bg-secondary text-gray-400" : ""
        }`}
      />

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={here}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? VOTER_HERE : "")}
          className="h-4 w-4 cursor-pointer rounded border-gray text-primary focus:ring-primary/30"
        />
        Registered here in {VOTER_HERE}
      </label>

      {!disabled && !here && <CharsLeft value={value} max={30} />}
    </FormField>
  );
}

/**
 * A question the paper gives three blanks and life sometimes gives more.
 *
 * Q56 and Q57 are printed with three lines each. Three is what fits on the
 * page, not what a household has to say, so rows are added as they are needed
 * and the empty ones are never sent.
 */
function StringList({
  label,
  hint,
  placeholder,
  values,
  onChange,
  addLabel,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  values: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
}) {
  const rows = values.length ? values : [""];

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <p className="mb-1.5 text-sm font-medium text-dark">{label}</p>
      {hint && <p className="mb-2 text-xs text-gray-400">{hint}</p>}

      <div className="space-y-2">
        {rows.map((one, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-3 w-5 shrink-0 text-xs font-semibold text-gray-400">{i + 1}.</span>
            <span className="min-w-0 flex-1">
              <input
                type="text"
                maxLength={80}
                value={one}
                placeholder={placeholder}
                onChange={(e) => onChange(rows.map((old, j) => (j === i ? e.target.value : old)))}
                className={inputClasses}
              />
              <CharsLeft value={one} max={80} />
            </span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={`Remove line ${i + 1}`}
                className="mt-1.5 shrink-0 cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <FiX className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, ""])}
        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}

/**
 * Q54 and Q55 - deaths in the household in the past twelve months.
 *
 * The paper has room for one of each, and a household that lost two people
 * had nowhere to say so. Recorded as one, the second death simply never
 * happened as far as the barangay's own figures are concerned - and these are
 * the figures a maternal or under-five death is noticed in.
 */
function DeathList({
  label,
  hint,
  rows,
  onChange,
  addLabel,
  maxAge,
  sexes,
}: {
  label: string;
  hint?: string;
  rows: DeathRow[];
  onChange: (next: DeathRow[]) => void;
  addLabel: string;
  maxAge: number;
  /** Only Q55 asks the sex; Q54 is about a woman by definition. */
  sexes?: Record<string, string>;
}) {
  const at = (i: number, patch: Partial<DeathRow>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <p className="mb-1.5 text-sm font-medium text-dark">{label}</p>
      {hint && <p className="mb-2 text-xs text-gray-400">{hint}</p>}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray px-3 py-3 text-xs text-gray-400">
          None reported.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-5 shrink-0 text-xs font-semibold text-gray-400">{i + 1}.</span>

              <input
                type="text"
                inputMode="numeric"
                placeholder="Age"
                value={row.age ?? ""}
                onChange={(e) => {
                  const only = onlyDigits(e.target.value, 3);
                  if (only !== "" && Number(only) > maxAge) return;
                  at(i, { age: only });
                }}
                className={`${inputClasses} w-20 shrink-0`}
              />

              {sexes && (
                <select
                  value={row.sex ?? ""}
                  onChange={(e) => at(i, { sex: e.target.value })}
                  className={`${inputClasses} w-32 shrink-0`}
                >
                  <option value="">Sex</option>
                  {Object.entries(sexes).map(([code, text]) => (
                    <option key={code} value={code}>
                      {code} · {text}
                    </option>
                  ))}
                </select>
              )}

              <span className="min-w-40 flex-1">
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Cause of death"
                  value={row.cause ?? ""}
                  onChange={(e) => at(i, { cause: e.target.value })}
                  className={inputClasses}
                />
                <CharsLeft value={row.cause} max={80} />
              </span>

              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={`Remove line ${i + 1}`}
                className="shrink-0 cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <FiX className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...rows, { age: "", cause: "" }])}
        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}

/**
 * The email box, which checks itself as it is typed.
 *
 * A portal account is issued against an email address and against nothing
 * else, so `residents.email` is unique and two people cannot share one. The
 * moment to discover a clash is while the BHW is still standing at the door
 * and can ask for a second address — not weeks later, when the line is being
 * matched and the address is quietly dropped because somebody else holds it.
 *
 * Checked as it is typed rather than behind a button. A button is one per
 * line, ten lines to a form, and the one nobody remembers to press is
 * exactly the one that was wrong.
 *
 * Not everything it finds is an error. The commonest hit by far is that this
 * IS the person — a head already on the register being written onto a form —
 * so the box names who holds the address and lets the office decide.
 */
function EmailField({
  value,
  onChange,
  censusId,
  residentId,
  clashLine,
  disabled = false,
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  censusId?: string;
  /** Who this line is already matched to — their own address is not a clash. */
  residentId?: number | null;
  /** Another line on this same form holding the same address, if any. */
  clashLine: number | null;
  disabled?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ available: boolean; message: string } | null>(null);

  const typed = String(value ?? "").trim();

  useEffect(() => {
    if (!typed) {
      setResult(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    setResult(null);

    /*
     * A pause, because this fires on a keystroke: without it the office is
     * told "that is not an email address" while still typing the domain.
     */
    const timer = setTimeout(() => {
      api
        .get("/rbim/check-email", {
          params: { email: typed, census_id: censusId, resident_id: residentId ?? undefined },
        })
        .then((r) =>
          setResult({ available: r.data.data.available, message: r.data.message })
        )
        .catch(() => setResult(null))
        .finally(() => setChecking(false));
    }, 500);

    return () => clearTimeout(timer);
  }, [typed, censusId, residentId]);

  // A clash inside this one form needs no server to see, so it is said first.
  const onFormClash = clashLine !== null && typed !== "";
  const bad = onFormClash || (result !== null && !result.available);

  return (
    <div>
      <FormField
        label="Email address"
        hint="What their portal login is issued to. Without one, they cannot sign in."
      >
        <input
          type="email"
          maxLength={80}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={[
            inputClasses,
            disabled ? "cursor-not-allowed bg-secondary text-gray-400" : "",
            bad ? "border-red-400" : "",
          ].join(" ")}
        />

        {/*
          The costliest box on the form to truncate quietly: an address cut
          short still looks like an address, and the portal account is issued
          against it.
        */}
        {!disabled && <CharsLeft value={value} max={80} />}
      </FormField>

      {onFormClash ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-red-600">
          <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Line {clashLine} on this form already has this address. One login belongs to
            one person, so only one of them can keep it.
          </span>
        </p>
      ) : checking ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
          <FiLoader className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          Checking…
        </p>
      ) : result ? (
        <p
          className={
            "mt-1 flex items-start gap-1.5 text-xs " +
            (result.available ? "text-green-700" : "text-amber-700")
          }
        >
          {result.available ? (
            <FiCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{result.message}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a census line already answers about a person, in the register's own
 * words.
 *
 * The resident form starts every field empty on purpose — a default there is
 * a guess that becomes fact the moment nobody notices it. A census answer is
 * not a guess: it is what the household said, written down at the door. So
 * these carry, and only these.
 *
 * What deliberately does NOT carry:
 *
 *   birthdate  Q5 asks the month and the year. The register stores a date,
 *              and there is no day in a census to put in it. Inventing the
 *              first of the month would be a made-up birthday on a permanent
 *              record.
 *   education  Q11's fourteen codes and the register's list are different
 *              vocabularies. A rough mapping would be wrong more often than
 *              blank is.
 *   residency  Nobody asked. Q36 is worked out from Q33–Q35, and that is not
 *              the same question.
 */
/** One collapsible block of the paper form. */
function Section({
  title,
  note,
  children,
  openByDefault = false,
  progress,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  openByDefault?: boolean;
  /**
   * How many of this section's questions are answered.
   *
   * On the header, because the sections are folded shut: without it the only
   * way to find the one box still missing is to open all nine and read them.
   */
  progress?: { filled: number; total: number };
}) {
  const [open, setOpen] = useState(openByDefault);

  return (
    <div className="rounded-xl border border-gray bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <FiChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        ) : (
          <FiChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        )}
        <span className="text-sm font-semibold text-dark">{title}</span>
        {note && <span className="text-xs text-gray-400">· {note}</span>}

        {/*
          Nothing is required here, so this counts rather than complains.
          A form can be submitted with gaps — a household that would not
          answer Q23 is a fact, not a mistake — and the count is there to
          show what is left, not to stand in the way.
        */}
        {progress && (
          <span className="ml-auto shrink-0">
            {progress.total === 0 ? (
              <span className="text-xs text-gray-400">Not asked</span>
            ) : progress.filled === progress.total ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Complete
              </span>
            ) : (
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold " +
                  (progress.filled === 0
                    ? "bg-secondary text-gray-500"
                    : "bg-amber-50 text-amber-700")
                }
              >
                {progress.filled}/{progress.total}
              </span>
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 border-t border-gray p-4 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function RbimForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const editing = Boolean(id);

  const [codes, setCodes] = useState<{ member: Codes; household: Codes }>({
    member: {},
    household: {},
  });
  const [form, setForm] = useState<Record<string, FormValue>>({
    household_head_name: "",
    ...HOME,
    is_institutional: false,
    consent_given: false,
  });
  const [members, setMembers] = useState<Member[]>([{ ...BLANK_MEMBER }]);
  const [status, setStatus] = useState<"Draft" | "Submitted">("Draft");
  const [censusNo, setCensusNo] = useState("");
  const [matches, setMatches] = useState<Record<number, Resident | null>>({});
  const [checking, setChecking] = useState(false);
  const [houseCheck, setHouseCheck] = useState<HouseCheck | null>(null);
  /*
   * What Submit found missing. Held in state rather than shown as a toast,
   * because it is a list to work through, not a notification.
   */
  const [gaps, setGaps] = useState<string[]>([]);
  /*
   * Submitting creates people. A confirmation dialogue with a list of names
   * in it is not enough to check a form of ten against a paper sheet — the
   * office needs to see the answers, laid out the way they were typed.
   */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  /*
   * People the register already places in this household who are not on
   * this sheet.
   *
   * Checked when an existing form opens, because that is the moment the
   * office is about to add "the rest of the household" and has no way of
   * knowing who that is.
   */
  const [notOnSheet, setNotOnSheet] = useState<HouseCheck | null>(null);
  /*
   * What the form looked like when it was last saved or loaded.
   *
   * Verifying a different number throws the sheet away and starts again, so
   * something has to know whether there was anything worth keeping. A
   * snapshot compared as text is enough here — the form is small, and the
   * question is only "is this the same as what is stored".
   */
  const pristine = useRef("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);

  useEffect(() => {
    api.get("/rbim/code-lists").then((r) => setCodes(r.data.data));
  }, []);

  /*
   * A brand-new sheet starts clean.
   *
   * The snapshot began life as an empty string, so an untouched form
   * compared unequal to it and counted as unsaved work — pressing Verify on
   * a blank sheet asked whether to save nothing. An existing form takes its
   * own snapshot when it loads.
   */
  useEffect(() => {
    if (!editing) pristine.current = snapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editing) return;

    api
      .get(`/rbim/${id}`)
      .then((r) => {
        const data = r.data.data;
        // A form saved through the API may carry none of these; the boxes
        // cannot be typed in, so they are filled here or not at all.
        setForm({
          ...data,
          province: data.province || HOME.province,
          city_municipality: data.city_municipality || HOME.city_municipality,
          barangay: data.barangay || HOME.barangay,
        });
        setStatus(data.status);
        setCensusNo(data.census_no);
        setMembers(data.members?.length ? data.members : [{ ...BLANK_MEMBER }]);

        // Who each line already is on the register, so the card can say so.
        const matched: Record<number, Resident | null> = {};
        (data.members ?? []).forEach((m: Record<string, unknown>, i: number) => {
          matched[i] = (m.resident as Resident) ?? null;
        });
        setMatches(matched);
        // Loaded from the server, so nothing is unsaved yet.
        pristine.current = snapshot(data, data.members ?? [{ ...BLANK_MEMBER }]);

        /*
         * And who the register says lives here.
         *
         * This is the question "Continue editing — add the rest there" is
         * asking on the office's behalf, so it is answered on arrival rather
         * than left for them to work out by opening the household in another
         * tab and comparing names by eye.
         *
         * A failure here is silence: the form is perfectly usable without
         * the offer, and an error banner about a convenience would only be
         * in the way.
         */
        if (data.census_no) {
          api
            .get("/rbim/verify-household", {
              params: { household_number: data.census_no, census_id: id },
            })
            .then((h) => setNotOnSheet(h.data.data))
            .catch(() => setNotOnSheet(null));
        }
      })
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (key: string, value: FormValue) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /*
   * A list answer, read back safely.
   *
   * An older form saved before Q54–Q57 became lists holds nothing at all
   * under these keys, and a form loaded from the server holds whatever the
   * JSON column had. Neither is allowed to reach a .map().
   */
  const listOf = <T,>(key: string): T[] => (Array.isArray(form[key]) ? (form[key] as T[]) : []);

  /* An empty list is no answer, and no answer is null — not [] . */
  const setList = (key: string, next: string[] | DeathRow[]) =>
    set(key, next.length ? next : null);

  /**
   * Puts the head's name on line 1.
   *
   * Only while line 1 is still the head: once somebody has typed a different
   * name there, the grid is the record and this stops touching it. Silently
   * overwriting a line an encoder has already filled in is worse than making
   * them type the name twice.
   */
  /**
   * Line 1 IS the household head.
   *
   * The form says so in its own margin — "List HH members in this order:
   * Head, Spouse of Head, …" — and Q2 code 01 is Head. So the name is not
   * copied across on a best-effort basis; line 1 simply holds whatever the
   * head field holds, and there is no way for the two to disagree.
   *
   * An earlier version only filled line 1 while it looked untouched, so that
   * a hand-typed line would not be clobbered. That guard is what let the head
   * say "Dela Cruz, Juan" while line 1 said "Miguel": two answers to one
   * question, and no way to tell which the barangay meant.
   */
  const fillLineOneFrom = (full: string) => {
    const parts = splitHeadName(full);

    setMembers((prev) => {
      const first = prev[0] ?? { ...BLANK_MEMBER };

      return [
        {
          ...first,
          last_name: parts.last,
          first_name: parts.first,
          middle_name: parts.middle,
          // Q2 code 01. The head is the head.
          q2_relationship: 1,
        },
        ...prev.slice(1),
      ];
    });
  };

  /*
   * A yes/no, kept as 1 and 0.
   *
   * Every other answer on a line is text or one of the form's numbered
   * codes, and `setMember` turns "" into null — which is right for a box
   * somebody cleared and wrong for a switch somebody turned off. Laravel's
   * boolean rule takes 1 and 0, so the wire is happy and the type stays as
   * narrow as the other forty-four answers.
   */
  const setMemberFlag = (index: number, key: string, on: boolean) =>
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, [key]: on ? 1 : 0 } : m)));

  const setMember = (index: number, key: string, value: string) =>
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [key]: value === "" ? null : value } : m))
    );

  /**
   * Which other line on this form already carries a member's address.
   *
   * The register cannot hold one address twice, so a form that collects one
   * twice is a form that will lose a login at matching time. Both lines are
   * flagged: until one of them changes, neither is right.
   */
  const clashingLine = (index: number): number | null => {
    const email = String(members[index]?.email ?? "").trim().toLowerCase();
    if (!email) return null;

    const other = members.findIndex(
      (m, i) => i !== index && String(m.email ?? "").trim().toLowerCase() === email
    );

    return other === -1 ? null : other + 1;
  };

  // Lines with a name on them — a blank card the clerk has not filled in
  // yet is not a person.
  const filledLines = members.filter((mem) => mem.first_name || mem.last_name).length;

  /** Empty strings out, so a blank box is absent rather than an empty answer. */
  const clean = (source: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    Object.entries(source).forEach(([k, v]) => {
      if (v === "" || v === undefined) return;
      // The server owns these; sending them back invites a stale write.
      /*
        The server owns these. census_no is NOT among them: the paper form
        carries a number in its own boxes, and a clerk copying that number
        across is the point of the field — stripping it here meant the box
        accepted typing and threw it away.
      */
      if (["id", "created_at", "updated_at", "members", "resident", "recorder",
           "reviewer", "household", "status", "members_count",
           "submitted_at", "reviewed_at", "reviewed_by", "recorded_by",
           "rbim_census_id", "resident_id"].includes(k)) return;
      /*
       * A list answer — Q54 to Q57 — with its blank rows left behind.
       *
       * The lists always show one empty row to type into, and that row must
       * not travel: a household that named two diseases would otherwise be
       * recorded as naming three, the third being "". An emptied list is
       * sent as null rather than dropped, because a dropped key leaves the
       * old answer standing on the server.
       */
      if (Array.isArray(v)) {
        const rows = (v as unknown[])
          .map((row) =>
            typeof row === "string"
              ? row.trim()
              : Object.fromEntries(
                  Object.entries((row ?? {}) as Record<string, unknown>).filter(
                    ([, cell]) => String(cell ?? "").trim() !== ""
                  )
                )
          )
          .filter((row) => (typeof row === "string" ? row !== "" : Object.keys(row).length > 0));

        out[k] = rows.length ? rows : null;
        return;
      }

      out[k] = v;
    });
    return out;
  };

  /**
   * Everything a clerk could have typed, as one comparable string.
   *
   * The form NUMBER is left out on purpose. It is the thing being checked,
   * not work to be rescued — counting it meant that typing a number and
   * pressing Verify on an otherwise empty sheet asked whether to save the
   * number first, which is a question about nothing.
   */
  const snapshot = (
    f: Record<string, unknown> = form,
    mem: Member[] = members
  ) => {
    const { census_no: _ignored, ...rest } = clean(f);

    return JSON.stringify({ f: rest, m: mem.map((one) => clean(one)) });
  };

  const isDirty = () => snapshot() !== pristine.current;

  /** Back to an empty sheet, keeping the number that was just checked. */
  const resetForm = (keepNumber: string) => {
    const blank = {
      census_no: keepNumber,
      household_head_name: "",
      ...HOME,
      is_institutional: false,
      consent_given: false,
    };

    setForm(blank);
    setMembers([{ ...BLANK_MEMBER }]);
    pristine.current = snapshot(blank, [{ ...BLANK_MEMBER }]);
  };

  /**
   * Asks whether this house is already on the register.
   *
   * It only asks. Joining the existing household, correcting a mistyped
   * number, or stopping to go back and ask the respondent are three
   * different decisions, and none of them is safe to make automatically.
   */
  const verifyHouse = async () => {
    const number = String(form.census_no ?? "").trim();
    if (!number) return;

    /*
     * Checking a number means starting that household's sheet — so anything
     * already typed is about to go. Asked before the check runs, not after:
     * by then the clerk has read an answer and is deciding on it, and a
     * dialogue about the previous household is an interruption in the wrong
     * place.
     */
    if (isDirty()) {
      const keep = await confirmAction({
        title: "Save what is on this form first?",
        text:
          "Checking another number starts that household's sheet, and what is typed here "
          + "has not been saved.",
        confirmText: "Save first",
        cancelText: "Discard it",
      });

      if (keep) {
        // Stay put: they pressed Verify, not Save. Bouncing them to the list
        // would take away the number they were in the middle of checking.
        await save(undefined, false);
        return;
      }
    }

    setChecking(true);
    setHouseCheck(null);
    try {
      const r = await api.get("/rbim/verify-household", {
        // Not this form. Otherwise verifying the number already on it
        // reported the form itself as a clash and offered a link back to
        // the page the office was already on.
        params: { household_number: number, census_id: id },
      });
      setHouseCheck(r.data.data);

      if (!r.data.data.exists) {
        /*
         * A free number is a new household, so the sheet starts empty. The
         * number itself is kept — it is what the clerk just typed and just
         * checked.
         */
        resetForm(number);
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setChecking(false);
    }
  };

  /**
   * Carries who the register already says lives here onto the grid.
   *
   * The office is not starting from nothing: the household exists and its
   * people are on the register. Making the encoder retype names the system
   * already holds is how a household ends up with two spellings of the same
   * person — so the lines are laid out first, and the visit fills in what
   * the census asks that the register does not.
   *
   * Lines already typed are kept. Anyone matching one by name is not added
   * again.
   */
  const continueHousehold = () => {
    const house = houseCheck?.household;
    if (!house) return;

    bringOntoForm(house, houseCheck?.residents ?? []);
    setHouseCheck(null);
  };

  /*
   * The merge itself, shared by both ways in: verifying a number before the
   * form is started, and opening a census that already exists. The second
   * had no way to do this at all — "Continue editing" opened the form and
   * left the household's registered people behind, which is the one thing
   * the button is for.
   */
  const bringOntoForm = (
    house: NonNullable<HouseCheck["household"]>,
    people: NonNullable<HouseCheck["residents"]>
  ) => {
    set("household_id", house.id);

    const typed = members.filter((mem) => mem.first_name || mem.last_name);

    const already = new Set(
      typed.map((mem) =>
        `${String(mem.first_name).trim()}|${String(mem.last_name).trim()}`.toLowerCase()
      )
    );

    const carried: Member[] = people
      .filter(
        (r) => !already.has(`${r.first_name.trim()}|${r.last_name.trim()}`.toLowerCase())
      )
      .map((r) => ({
        last_name: r.last_name,
        first_name: r.first_name,
        // One letter: the grid asks for an initial.
        middle_name: (r.middle_name ?? "").trim().charAt(0).toUpperCase(),
        q3_sex: r.gender === "Male" ? 1 : r.gender === "Female" ? 2 : null,
        q4_age: ageFrom(r.birthdate),
        q5_birth_month: r.birthdate ? Number(r.birthdate.slice(5, 7)) : null,
        q5_birth_year: r.birthdate ? Number(r.birthdate.slice(0, 4)) : null,
      }));

    /*
     * The head goes to line 1, and everybody else follows in the order the
     * form asks for. Whoever the register calls the head of this house is
     * the head on this sheet — dropping them into line 4 because that is
     * where the alphabet put them would contradict Q2 on their own line.
     */
    const headId = house.head?.id;
    const rest = [...typed, ...carried].filter(
      (mem) =>
        !headId ||
        `${mem.first_name}|${mem.last_name}`.toLowerCase() !==
          `${house.head!.first_name}|${house.head!.last_name}`.toLowerCase()
    );

    if (house.head) {
      const headName = `${house.head.last_name}, ${house.head.first_name}`;
      set("household_head_name", headName);

      // fillLineOneFrom owns line 1, so it is written the same way here as
      // it is when somebody types the name by hand.
      setMembers([{ ...BLANK_MEMBER }, ...rest]);
      fillLineOneFrom(headName);
    } else {
      setMembers(rest.length ? rest : [{ ...BLANK_MEMBER }]);
    }

    toast(
      carried.length
        ? `${carried.length} person(s) already on the register were carried onto the form.`
        : "Everyone on the register for this household is already on the form."
    );
  };

  /**
   * Which of the household's registered people are missing from the grid.
   *
   * By name, the same comparison the merge uses — a line typed by hand and a
   * resident record are the same person if the names match, and offering to
   * add somebody already on the sheet is how a household ends up on it
   * twice.
   */
  const missingFromSheet = (): NonNullable<HouseCheck["residents"]> => {
    const people = notOnSheet?.residents ?? [];

    const typed = new Set(
      members
        .filter((mem) => mem.first_name || mem.last_name)
        .map((mem) =>
          `${String(mem.first_name ?? "").trim()}|${String(mem.last_name ?? "").trim()}`.toLowerCase()
        )
    );

    return people.filter(
      (r) => !typed.has(`${r.first_name.trim()}|${r.last_name.trim()}`.toLowerCase())
    );
  };

  /**
   * What the register still needs, line by line.
   *
   * The same rules the server applies, worked out here so the office reads
   * them on the form instead of in a toast. A toast is one sentence that
   * appears after the press and is gone four seconds later — which is how a
   * clerk ends up pressing Submit three times without ever learning that
   * line 4 has no sex on it.
   *
   * Only the lines that will actually be registered. A visiting cousin
   * switched off is nobody's missing birthday.
   */
  const registrationGaps = (): string[] => {
    const gaps: string[] = [];

    if (!String(form.zone_purok ?? "").trim()) {
      gaps.push("The purok, at the top of the form — every resident record carries one.");
    }

    if (!form.consent_given) {
      gaps.push("The respondent's consent, at the bottom — the census may not be used without it.");
    }

    members.forEach((mem, index) => {
      const named = String(mem.first_name ?? "").trim() || String(mem.last_name ?? "").trim();
      if (!named) return;

      // Line 1 is the head and is always registered, switch or no switch.
      const willRegister = index === 0 || Number(mem.register_as_resident ?? 1) === 1;
      if (!willRegister) return;

      // Somebody already on the register is not re-checked; they are done.
      if (matches[index]) return;

      const missing: string[] = [];

      if (!String(mem.first_name ?? "").trim()) missing.push("a first name (Q1)");
      if (!String(mem.last_name ?? "").trim()) missing.push("a surname (Q1)");
      if (![1, 2].includes(Number(mem.q3_sex))) missing.push("sex (Q3)");
      if (!Number(mem.q5_birth_month)) missing.push("a birth month (Q5)");
      if (!Number(mem.q5_birth_year)) missing.push("a birth year (Q5)");

      if (missing.length) {
        const who = `${mem.first_name ?? ""} ${mem.last_name ?? ""}`.trim();
        gaps.push(`Line ${index + 1}${who ? ` (${who})` : ""} needs ${missing.join(", ")}.`);
      }
    });

    return gaps;
  };
  /**
   * `thenLeave` is false only when saving is a step inside submitting: the
   * office pressed Submit, the form had unsaved edits, and leaving for the
   * list halfway through would abandon the thing they actually asked for.
   */
  /**
   * Returns the record's id, which the caller may need next.
   *
   * A new form has no id until this runs — and Submit is the one caller that
   * has to know it, because registering posts to /rbim/{id}/submit. Reading
   * it back off the route afterwards is a race with the navigation.
   */
  const save = async (event?: FormEvent, thenLeave = true): Promise<string | undefined> => {
    event?.preventDefault();
    setSaving(true);

    const payload = {
      ...clean(form),
      // The counted value, not whatever the field last held — the box is
      // read-only now and the grid is the answer.
      total_members: filledLines,
      members: members
        .filter((m) => m.first_name || m.last_name)
        /*
         * The age is written into the row on the way out, not held in state.
         * Keeping a derived value in state means an effect that watches Q5
         * and writes Q4, which is a render loop waiting to happen; filling
         * it here means the census line still carries the age it was read at.
         */
        .map((m, i) => ({
          ...clean(m),
          line_no: i + 1,
          q4_age: ageOf(m) ?? undefined,
        })),
    };

    try {
      if (editing) {
        await api.put(`/rbim/${id}`, payload);
        pristine.current = snapshot();
        toast("Census form saved.");

        /*
         * Back to the list, because that is where a saved form can be SEEN
         * to be saved. Staying on the page leaves the office looking at the
         * same boxes they were looking at before, trusting a toast that is
         * about to disappear.
         */
        if (thenLeave) navigate("/population/rbim");

        return id;
      } else {
        const r = await api.post("/rbim", payload);
        pristine.current = snapshot();
        toast(r.data.message);

        /*
         * A new draft goes to the list too, for the same reason a saved one
         * does: the row appearing there is what the office can SEE. Landing
         * back on the form they were already looking at asks them to trust a
         * toast that is about to disappear.
         */
        navigate(thenLeave ? "/population/rbim" : `/population/rbim/${r.data.data.id}`, {
          replace: true,
        });

        return String(r.data.data.id);
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Registers the household.
   *
   * Everything on the form becomes a resident record and each line is joined
   * to the person it made, so the census and the register cannot drift into
   * being two accounts of one household. Pressing it again after an edit adds
   * only whoever is new — which is what makes a form that gains a baby six
   * months later still the right form.
   *
   * Confirmed by name first, because it is the one press in this module that
   * writes to the register.
   */
  /*
   * The record Submit is about to register.
   *
   * Held here rather than read off the route: on a brand-new form the id does
   * not exist until the save inside submitForm creates it, and the navigation
   * that puts it in the URL has not necessarily landed by the time the office
   * presses Register in the preview.
   */
  const registering_id = useRef<string | undefined>(undefined);

  const submitForm = async () => {
    /*
     * Check first, save second.
     *
     * A new form used to have no Submit button at all: it was hidden until a
     * draft existed, so the only way to reach it was to save a draft, leave,
     * and open the form again. Registering in one sitting is the ordinary
     * case, and it was the one path the screen did not offer.
     *
     * The gaps are read before anything is written so an incomplete sheet
     * does not leave a half-filled draft behind on a button press that was
     * never going to succeed.
     */
    const gapsFirst = registrationGaps();

    if (gapsFirst.length) {
      setGaps(gapsFirst);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast(`${gapsFirst.length} thing(s) still missing — listed at the top of the form.`, "warning");

      return;
    }

    // What is on screen has to be what gets registered.
    if (isDirty()) {
      const keep = await confirmAction({
        title: "Save this form first?",
        text: "The saved answers are what would be registered, not the ones on screen.",
        confirmText: "Save and continue",
        cancelText: "Stay here",
      });

      if (!keep) return;
      // Stay here: the submit is the next thing that happens.
      registering_id.current = await save(undefined, false);
    } else {
      registering_id.current = id;
    }

    if (!registering_id.current) {
      /* The save failed and said so; adding a second toast would only bury
         the first. */
      return;
    }

    setGaps([]);

    // Everything checked; now let them read it before it becomes people.
    setPreviewOpen(true);
  };

  /** What Submit does once the office has read the preview and agreed. */
  const registerHousehold = async () => {
    setRegistering(true);

    try {
      const r = await api.post(`/rbim/${registering_id.current ?? id}/submit`);
      setPreviewOpen(false);
      toast(r.data.message);

      // Back to the list, where the row now reads Submitted. Seeing it there
      // is the proof; a toast on the form they were already on is not.
      navigate("/population/rbim");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return <p className="p-6 text-sm text-gray-500">Loading the census form…</p>;
  }

  const m = codes.member;
  const h = codes.household;

  return (
    <div>
      <PageHeader
        title={editing ? `Census ${censusNo}` : "New RBIM census form"}
        subtitle="Baseline Census for the Registry of Barangay Inhabitants & Migrants"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {editing && <StatusBadge status={status} />}
            <Link
              to="/population/rbim"
              className="inline-flex items-center gap-2 rounded-full border border-gray bg-white px-4 py-2 text-sm font-semibold text-dark transition-colors hover:border-primary"
            >
              <FiArrowLeft className="h-4 w-4" aria-hidden="true" /> All forms
            </Link>
          </div>
        }
      />

      {/*
        What Submit found missing, at the top where the office is looking.

        It stays until it is fixed, and it re-checks itself as they type, so
        the list shrinks under their hands. A toast said the same thing once
        and then took it away.
      */}
      {gaps.length > 0 && (
        <Card className="mb-4 border-danger/40">
          <p className="flex items-center gap-2 text-sm font-bold text-danger">
            <FiAlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {registrationGaps().length === 0
              ? "All set — press Submit again."
              : `${registrationGaps().length} thing(s) needed before this household can be registered`}
          </p>

          {registrationGaps().length > 0 && (
            <>
              <ul className="mt-2 space-y-1">
                {registrationGaps().map((gap) => (
                  <li key={gap} className="flex gap-2 text-xs leading-relaxed text-gray-700">
                    <span className="text-danger">•</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                The boxes are starred on the form. Nothing here stops you saving a draft —
                it is only registering that needs them.
              </p>
            </>
          )}
        </Card>
      )}

      {/*
        The last look before a form becomes people.

        Submitting writes resident records, and the office is working from a
        paper sheet they cannot see at the same time as the screen. What they
        need at this moment is the answers they typed, laid out to be read
        against that sheet — not a dialogue box with a list of names in it,
        which proves nothing about whether line 4's birth year is right.
      */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size="xl"
        title={status === "Draft" ? "Check before registering" : "Check before registering anybody new"}
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-gray-500">
            Read this against the paper sheet. Submitting puts everybody marked below on the
            barangay register; anybody already there is left alone.{" "}
            {/*
              Said here because this is where the email addresses are on
              screen. The account is no longer a second job to remember — it
              is part of registering, and the only thing that decides who
              gets one is whether Q1 carries an email address.
            */}
            <span className="text-gray-600">
              Everybody with an email address below is also given a portal account and emailed
              their sign-in details — no separate step.
            </span>
          </p>

          <div className="rounded-xl border border-gray p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              A. Identification
            </p>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {[
                ["Form no.", String(form.census_no ?? "—")],
                ["Household head", String(form.household_head_name ?? "—")],
                ["Purok", String(form.zone_purok ?? "—")],
                ["Address", [form.address_unit, form.address_house_lot, form.address_street]
                  .map((x) => String(x ?? "").trim()).filter(Boolean).join(", ") || "—"],
                ["Respondent", String(form.respondent_name ?? "—")],
                ["Total members", String(filledLines)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-right font-medium text-dark">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="max-h-[24rem] space-y-2 overflow-y-auto">
            {members.map((mem, index) => {
              const named = String(mem.first_name ?? "").trim()
                || String(mem.last_name ?? "").trim();
              if (!named) return null;

              const willRegister = index === 0
                || Number(mem.register_as_resident ?? 1) === 1;
              const already = matches[index];

              return (
                <div key={index} className="rounded-xl border border-gray p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-dark">
                      Line {index + 1} · {mem.first_name} {mem.middle_name} {mem.last_name}
                    </p>
                    {already ? (
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
                        Already on the register
                      </span>
                    ) : willRegister ? (
                      <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
                        Will be registered
                      </span>
                    ) : (
                      /*
                        Said plainly, because this is the last moment it can be
                        changed — and a line silently left off is how somebody
                        goes uncounted for a year.
                      */
                      <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                        Not being registered
                      </span>
                    )}
                  </div>

                  <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                    {[
                      ["Q2 Relationship", m.relationships?.[String(mem.q2_relationship ?? "")] ?? "—"],
                      ["Q3 Sex", m.sexes?.[String(mem.q3_sex ?? "")] ?? "—"],
                      ["Q4 Age", ageOf(mem) !== null ? String(ageOf(mem)) : "—"],
                      ["Q5 Born", [
                        MONTHS[Number(mem.q5_birth_month) - 1],
                        mem.q5_birth_year,
                      ].filter(Boolean).join(" ") || "—"],
                      ["Q8 Marital status", m.marital_statuses?.[String(mem.q8_marital_status ?? "")] ?? "—"],
                      ["Q35 Length of stay", [
                        mem.q35_stay_years != null ? `${mem.q35_stay_years}y` : null,
                        mem.q35_stay_months != null ? `${mem.q35_stay_months}m` : null,
                      ].filter(Boolean).join(" ") || "—"],
                      /*
                        Not "—". A missing email is the difference between a
                        resident who can use the portal and one who cannot,
                        and this is the last screen where it can be typed in.
                      */
                      ["Email", String(mem.email ?? "")
                        || (willRegister && !already ? "none — no portal account" : "—")],
                      ["Phone", String(mem.contact_number ?? "") || "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-gray-400">{label}</dt>
                        <dd className="text-right font-medium text-dark">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray pt-4">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="cursor-pointer rounded-full border border-gray bg-white px-6 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
            >
              Go back and fix something
            </button>
            <button
              type="button"
              disabled={registering}
              onClick={() => void registerHousehold()}
              className="cursor-pointer rounded-full bg-success px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {registering ? "Registering…" : "Submit — register this household"}
            </button>
          </div>
        </div>
      </Modal>

      <form onSubmit={save} className="space-y-4">
        {/* ------------------- A. IDENTIFICATION ------------------- */}
        <Card title="A. Identification">
          {/*
            The top of the paper: the form's own number, and which of the two
            boxes is ticked. Both are printed above section A and both were
            missing here — the number was generated and never shown, so a
            clerk holding a numbered sheet had nowhere to put it.
          */}
          <div className="mb-5 grid grid-cols-1 gap-x-5 gap-y-4 border-b border-gray pb-5 sm:grid-cols-2">
            {/*
              One number. It is the form's number on the paper AND the
              household's number here — a barangay writes one sheet per
              house, so two fields asking for it was two chances to
              disagree.

              Checked before anything else is typed: the paper holds ten
              lines, and a household of fifteen comes back on a second
              sheet. That second sheet belongs on the form that already
              exists, not on a new one that nothing joins to it.
            */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-dark">No.</p>
              <div className="flex flex-wrap items-start gap-2">
                <input
                  value={(form.census_no as string) ?? ""}
                  onChange={(e) => { set("census_no", e.target.value); setHouseCheck(null); }}
                 
                  placeholder={editing ? "" : "Copy the number on the paper form"}
                  aria-label="Form and household number"
                  className={`${inputClasses} max-w-xs flex-1`}
                />
                <button
                  type="button"
                  onClick={verifyHouse}
                  /*
                    Nothing to verify once the household is registered.
                    Verifying asks "is this number free, and who lives
                    there?" — and this form is the answer to both. The number
                    itself stays editable: a sheet can be filed under the
                    wrong one and the correction has to go somewhere.
                  */
                  disabled={
                    status === "Submitted" || checking || !String(form.census_no ?? "").trim()
                  }
                  className="cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
                >
                  {checking ? "Checking…" : "Verify"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                {status === "Submitted"
                  ? "This household is registered, so there is nothing left to check — but the number can still be corrected."
                  : editing
                    ? "The number on the paper form, and this household's number."
                    : "Leave blank and one is issued automatically."}
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-dark">This form covers a</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: false, label: "Household" },
                  { value: true, label: "Institutional Living Quarters" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                   
                    onClick={() => set("is_institutional", option.value)}
                    aria-pressed={Boolean(form.is_institutional) === option.value}
                    className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                      Boolean(form.is_institutional) === option.value
                        ? "bg-primary text-white"
                        : "bg-secondary text-dark hover:bg-primary/10"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-400">
                A dormitory, care home or barracks is counted differently from a family
                household.
              </p>
            </div>

            {houseCheck && !houseCheck.exists && (
              <p className="rounded-xl bg-success/10 px-4 py-2.5 text-xs leading-relaxed text-dark sm:col-span-2">
                Nothing carries that number yet — this will be a new household.
              </p>
            )}

            {houseCheck?.exists && (
              <div className="rounded-xl border border-warning/50 bg-warning/5 p-4 sm:col-span-2">
                {/*
                  A form already covering this house is the answer, and the
                  only sensible action is to go and stand in it. Everything
                  else here is context for deciding whether it really is the
                  same house.
                */}
                {houseCheck.census ? (
                  <>
                    <p className="text-sm font-semibold text-dark">
                      Census {houseCheck.census.census_no} already covers this household
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">
                      {houseCheck.census.members_count} line(s) are on it, headed by{" "}
                      {houseCheck.census.household_head_name} · {houseCheck.census.status}.
                      The paper holds ten — add the rest of the household to that form rather
                      than starting another.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to={`/population/rbim/${houseCheck.census.id}`}
                        className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                      >
                        Continue editing {houseCheck.census.census_no} — add the rest there
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setHouseCheck(null); set("census_no", ""); }}
                        className="cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-primary hover:text-primary"
                      >
                        I typed the wrong number
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-dark">
                      Somebody already lives at {houseCheck.household?.household_number}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">
                      {houseCheck.resident_count} person(s) are recorded there
                      {houseCheck.household?.street_address &&
                        ` · ${houseCheck.household.street_address}`}
                      . No census form covers it yet, so this one will.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={continueHousehold}
                        className="cursor-pointer rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                      >
                        Continue this household — bring their {houseCheck.resident_count} onto
                        the form
                      </button>
                      <button
                        type="button"
                        onClick={() => { setHouseCheck(null); set("census_no", ""); }}
                        className="cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-primary hover:text-primary"
                      >
                        I typed the wrong number
                      </button>
                    </div>
                  </>
                )}

                {(houseCheck.residents?.length ?? 0) > 0 && (
                  <ul className="mt-3 space-y-0.5 text-xs text-gray-600">
                    {houseCheck.residents!.slice(0, 12).map((r) => (
                      <li key={r.id}>
                        {r.first_name} {r.last_name}{" "}
                        <span className="text-gray-400">{r.resident_number}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-xs leading-relaxed text-gray-500">
                  If the number really is this one and the people do not match, stop here — the
                  respondent may have given the wrong number, and that is a question for the next
                  visit rather than something to decide at a keyboard.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {/*
              Fixed. This is Barangay Natumolan's own register and every
              form in it is taken here — three boxes a clerk could mistype
              and nobody would notice, answering a question that has one
              answer.
            */}
            <Text label="Province" value={form.province as string} onChange={() => undefined} readOnly />
            <Text label="City / Municipality" value={form.city_municipality as string} onChange={() => undefined} readOnly />
            <Text label="Barangay" value={form.barangay as string} onChange={() => undefined} readOnly />
            {/*
              The head is line 1 — that is what Q2 code 01 says — so the
              name typed here IS the first line of the grid. Written through
              rather than asked twice.
            */}
            <Text
              label="Household head"
              maxLength={80}
              required
              hint="Last Name, First Name M.I. — this fills line 1 below."
              value={form.household_head_name as string}
              onChange={(v) => {
                set("household_head_name", v);
                fillLineOneFrom(v);
              }}
            />
            <Text label="Respondent" hint="Last Name, First Name M.I." maxLength={80} value={form.respondent_name as string} onChange={(v) => set("respondent_name", v)} />
            {/*
              Counted, not typed.

              It used to be what the head said, kept beside the grid so the
              two could be compared. In practice it was a second place to
              get the same number wrong — so it is the grid now, and the
              grid is the thing the office actually holds.
            */}
            <Text
              label="Total members"
              value={filledLines}
              onChange={() => undefined}
              readOnly
              hint="Counted from the lines below."
            />
            {/*
              The head is line 1, so their email is asked there with
              everybody else's — repeating it here would be a second place
              to get one address wrong.
            */}
            {/*
              Not on the paper form, and the register cannot do without it:
              every resident record carries a purok, and submitting this form
              creates resident records.
            */}
            <Choice
              label="Purok"
              neededToRegister
              hint="Not on the paper form — the register needs one."
              options={PUROKS.map((p) => ({ value: p, label: p }))}
              value={form.zone_purok as string}
              onChange={(v) => set("zone_purok", v)}
            />
            <Text label="Room / Floor / Unit and Building" maxLength={80} value={form.address_unit as string} onChange={(v) => set("address_unit", v)} />
            <Text label="House / Lot and Block No." maxLength={80} value={form.address_house_lot as string} onChange={(v) => set("address_house_lot", v)} />
            <Text label="Street name" maxLength={80} value={form.address_street as string} onChange={(v) => set("address_street", v)} />

          </div>
        </Card>

        {/* ------------------- THE MEMBER GRID ------------------- */}
        <Card title="Household members">
          <p className="mb-4 text-xs leading-relaxed text-gray-500">
            One card per line on the paper form. The sections fold away because most do not apply
            to most people — a nine-year-old has no economic activity, and a non-migrant has no
            migration story.
          </p>

          {/*
            Only when there is somebody to add. A panel that says "nobody is
            missing" is a panel the office reads once and never again.
          */}
          {missingFromSheet().length > 0 && (
            <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4">
              <p className="text-sm font-semibold text-dark">
                {missingFromSheet().length} person(s) on the register for this household
                are not on this form
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                {missingFromSheet()
                  .map((r) => `${r.first_name} ${r.last_name}`)
                  .join(", ")}
                . Adding them here starts their lines from what the register already
                holds, so the visit only has to fill in what the census asks on top.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (notOnSheet?.household) {
                    bringOntoForm(notOnSheet.household, missingFromSheet());
                  }
                }}
                className="mt-3 cursor-pointer rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Bring them onto the form
              </button>
            </div>
          )}

          <div className="space-y-4">
            {members.map((member, index) => (
              <div key={index} className="rounded-2xl border border-gray bg-secondary/30 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-dark">
                    Line {index + 1}
                    {(member.first_name || member.last_name) && (
                      <span className="ml-2 font-normal text-gray-600">
                        {member.first_name} {member.last_name}
                      </span>
                    )}
                  </p>
                  {/* Line 1 is the head — there is no household without one. */}
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => setMembers((p) => p.filter((_, i) => i !== index))}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-gray bg-white px-3 py-1 text-xs font-semibold text-gray-500 transition-colors hover:border-danger hover:text-danger"
                    >
                      <FiX className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>

                <fieldset className="space-y-3">
                  <Section
                    title="Q1–Q14 · Demographics"
                    openByDefault
                    progress={progressOf([
                      "last_name", "first_name", "middle_name", "q2_relationship",
                      "q3_sex", "q4_age", "q5_birth_month", "q5_birth_year",
                      "q6_birthplace", "q7_nationality",
                      // Only a non-Filipino is asked which nationality.
                      String(member.q7_nationality ?? "") === "2" && "q7_nationality_other",
                      "q8_marital_status", "q9_religion", "q10_ethnicity",
                      /*
                        A locked box is not a question this line is being
                        asked, so it is not counted — in the numerator or the
                        denominator. Counting them is what left a
                        twenty-five-year-old stuck at 14/16 with two boxes
                        nobody could ever fill.
                      */
                      inBand(ageOf(member), 5) && "q11_education",
                      inBand(ageOf(member), 3) && "q12_enrolled",
                      schoolDetailsApply(member) && "q13_school_level",
                      schoolDetailsApply(member) && "q14_school_place",
                    ], member)}
                  >
                    {/*
                      On line 1 these are the head's name, typed once in
                      Identification. Read-only here rather than hidden, so
                      the encoder can see what the grid will carry — and
                      cannot make it say something else.
                    */}
                    <Text
                      label="Q1 Surname"
                      required
                      value={member.last_name}
                      onChange={(v) => setMember(index, "last_name", v)}
                      readOnly={index === 0}
                      hint={index === 0 ? "From the household head above." : undefined}
                    />
                    <Text
                      label="Q1 First name"
                      required
                      value={member.first_name}
                      onChange={(v) => setMember(index, "first_name", v)}
                      readOnly={index === 0}
                      hint={index === 0 ? "From the household head above." : undefined}
                    />
                    {/*
                      An initial, not a name. The paper will take either, and
                      the office asks for the initial — so the box holds one
                      letter and says so, rather than accepting a full middle
                      name that the register would then carry differently
                      from every other record.

                      On line 1 it comes from the head's name above, like the
                      other two. It was the one box of the three left open,
                      which meant line 1 could be made to disagree with the
                      name it is supposed to be.
                    */}
                    {/*
                      Typed as a letter, stored as an initial.

                      "L" and "L." are the same answer, and which one the
                      register ends up holding should not depend on whether
                      the encoder happened to reach for the full stop. So the
                      box takes either and keeps one.
                    */}
                    <Text
                      label="Q1 Middle initial"
                      value={member.middle_name}
                      maxLength={2}
                      onChange={(v) => setMember(index, "middle_name", asInitial(v))}
                      readOnly={index === 0}
                      hint={index === 0 ? "From the household head above." : "One letter, e.g. L."}
                    />
                    <Coded
                      label="Q2 Relationship to head"
                      list={m.relationships}
                      value={member.q2_relationship}
                      onChange={(v) => setMember(index, "q2_relationship", v)}
                      lockedTo={index === 0 ? 1 : undefined}
                      lockedNote="Line 1 is the head — that is what code 01 means."
                    />
                    <Coded label="Q3 Sex" neededToRegister list={m.sexes} value={member.q3_sex} onChange={(v) => setMember(index, "q3_sex", v)} />
                    {/*
                      Read-only once Q5 is answered, because then it is not a
                      separate fact: it is this month minus that one. A typed
                      age is only true on the day it was typed, and a census
                      form outlives the day it was filled in.
                    */}
                    <Text
                      label="Q4 Age at last birthday"
                      digits={3}
                      value={
                        ageFromMonthYear(member.q5_birth_month, member.q5_birth_year) ??
                        member.q4_age
                      }
                      onChange={(v) => setMember(index, "q4_age", v)}
                      readOnly={
                        ageFromMonthYear(member.q5_birth_month, member.q5_birth_year) !== null
                      }
                      hint={
                        ageFromMonthYear(member.q5_birth_month, member.q5_birth_year) !== null
                          ? "Counted from Q5, and it keeps counting."
                          : "Or answer Q5 and this fills itself."
                      }
                    />
                    <Choice
                      label="Q5 Birth month"
                      neededToRegister
                      options={MONTHS.map((name, i) => ({ value: String(i + 1), label: `${i + 1} · ${name}` }))}
                      value={member.q5_birth_month}
                      onChange={(v) => setMember(index, "q5_birth_month", v)}
                    />
                    <Choice
                      label="Q5 Birth year"
                      neededToRegister
                      options={BIRTH_YEARS.map((y) => ({ value: String(y), label: String(y) }))}
                      value={member.q5_birth_year}
                      onChange={(v) => setMember(index, "q5_birth_year", v)}
                    />
                    <Text label="Q6 Place of birth" hint="City/Municipality and Province" maxLength={80} value={member.q6_birthplace} onChange={(v) => setMember(index, "q6_birthplace", v)} />
                    <Coded label="Q7 Nationality" list={m.nationalities} value={member.q7_nationality} onChange={(v) => setMember(index, "q7_nationality", v)} />
                    {/*
                      Dead while the answer is Filipino. A country typed
                      beside "1 · Filipino" contradicts the box next to it,
                      and one of the two is going to be believed.
                    */}
                    <Text
                      label="Q7 If not Filipino"
                      placeholder="Which country?"
                      value={member.q7_nationality_other}
                      onChange={(v) => setMember(index, "q7_nationality_other", v)}
                      disabled={String(member.q7_nationality ?? "") !== "2"}
                      disabledNote="Only for a non-Filipino."
                    />
                    <Coded label="Q8 Marital status" list={m.marital_statuses} value={member.q8_marital_status} onChange={(v) => setMember(index, "q8_marital_status", v)} />
                    <Text label="Q9 Religion" maxLength={20} value={member.q9_religion} onChange={(v) => setMember(index, "q9_religion", v)} />
                    {/*
                      The examples are printed in the question on the paper,
                      where the BHW reads them aloud. An encoder working from
                      a filled sheet never sees that wording, so it is
                      repeated here.
                    */}
                    <Text
                      label="Q10 Ethnicity"
                      maxLength={30}
                      hint="Tagalog, Bicolano, Bisaya, etc."
                      value={member.q10_ethnicity}
                      onChange={(v) => setMember(index, "q10_ethnicity", v)}
                    />
                    {/*
                      Q11 keeps its age band: below five there is no level
                      completed yet, which is true of every five-year-old
                      there has ever been. The paper says write 99, so 99 is
                      what goes in.

                      Q12 keeps only the lower half of its band. Nobody under
                      three is enrolled anywhere — but plenty of people are
                      enrolled at forty, and the paper's "25 and above, write
                      99" would have the form deny it. See schoolDetailsApply.
                    */}
                    {/*
                      Q11 and Q13 look alike and are not.

                      Q11 is what they have finished — fourteen codes, and
                      the graduate ones are the point of it. Q13 is what they
                      are sitting in right now, six codes, and only if Q12
                      says they are enrolled. A college graduate of thirty
                      taking a vocational course answers 12 to one and 4 to
                      the other.

                      Both labels say which is which, because "school level"
                      on its own reads as a repeat of the box above it.
                    */}
                    <Coded
                      label="Q11 Highest level completed"
                      hint="What they have already finished. 5 and above."
                      list={m.education_levels}
                      value={member.q11_education}
                      onChange={(v) => setMember(index, "q11_education", v)}
                      skipped={outOfBand(ageOf(member), 5)}
                      skippedNote="99 — under 5, so there is no level completed."
                    />
                    <Coded
                      label="Q12 Currently enrolled"
                      hint="3 and above — at any age."
                      list={m.enrollment}
                      value={member.q12_enrolled}
                      onChange={(v) => setMember(index, "q12_enrolled", v)}
                      skipped={outOfBand(ageOf(member), 3)}
                      skippedNote="99 — under 3, so there is nothing to be enrolled in."
                    />
                    <Coded
                      label="Q13 Level now attending"
                      hint="What they are enrolled in now, not what they finished."
                      list={m.school_levels}
                      value={member.q13_school_level}
                      onChange={(v) => setMember(index, "q13_school_level", v)}
                      skipped={!schoolDetailsApply(member)}
                      skippedNote={
                        outOfBand(ageOf(member), 3)
                          ? "99 — under 3, so there is no schooling to record."
                          : "99 — Q12 is No, and the paper skips from there to Q15."
                      }
                    />
                    <Text
                      label="Q14 Place of school"
                      maxLength={80}
                      hint="Only when Q12 is Yes."
                      value={member.q14_school_place}
                      onChange={(v) => setMember(index, "q14_school_place", v)}
                      disabled={!schoolDetailsApply(member)}
                      disabledNote={
                        outOfBand(ageOf(member), 3)
                          ? "Under 3 — nothing to record."
                          : "Q12 is No, so there is no school to name."
                      }
                    />
                  </Section>

                  {/*
                    Not on the paper form, and the form cannot do without it.

                    A portal account is issued against an email address and
                    nothing else, so a household typed in entirely from a
                    census would come out with nobody able to sign in. Its
                    own section, and labelled as the system's question rather
                    than the census's — an encoder comparing screen to paper
                    should not spend a minute looking for it there.
                  */}
                  <Section
                    title="For the system"
                    note="not on the paper form"
                    openByDefault
                    progress={progressOf(["email", "contact_number"], member)}
                  >
                    <EmailField
                      value={member.email}
                      onChange={(v) => setMember(index, "email", v)}
                      censusId={id}
                      residentId={matches[index]?.id ?? null}
                      clashLine={clashingLine(index)}
                     
                    />
                    {/*
                      Not checked for duplicates, deliberately. A household
                      shares one phone all the time, nothing is issued
                      against it, and a warning that is usually wrong is a
                      warning the office learns to click past.
                    */}
                    {/*
                      One shape for a mobile number, because three arrive.
                      0917…, +63917… and 917… are the same phone, and a clerk
                      searching for one of them finds only the third of the
                      register that happens to be written their way.
                    */}
                    <FormField
                      label="Phone number"
                      hint="Ten digits after +63. It may be shared with the household."
                    >
                      <PhoneInput
                        value={String(member.contact_number ?? "")}
                        onChange={(v) => setMember(index, "contact_number", v)}
                      />
                    </FormField>
                  </Section>

                  <Section
                    title="Q15–Q18 · Economic activity"
                    note="15 and above"
                    progress={progressOf(
                      inBand(ageOf(member), 15)
                        ? [
                            "q15_monthly_income", "q16_income_source",
                            // Remittance, investments and others SKIP TO Q19.
                            !skipsToQ19(member) && "q17_work_status",
                            !skipsToQ19(member) && "q18_work_place",
                          ]
                        : [],
                      member
                    )}
                  >
                    {/*
                      A census answer about the resident, not barangay money.
                      The form's own instruction: if none, write 0 — so zero
                      is an answer and an empty box is not.
                    */}
                    <Text
                      label="Q15 Average monthly income"
                      money
                      digits={12}
                      prefix="₱"
                      placeholder="0"
                      hint="Per month. If none, write 0."
                      value={member.q15_monthly_income}
                      onChange={(v) => setMember(index, "q15_monthly_income", v)}
                      disabled={outOfBand(ageOf(member), 15)}
                      disabledNote="99 — under 15, so this is not asked."
                    />
                    {/*
                      Two separate reasons to close these, and the age one
                      comes first.

                      Under fifteen the whole section is 99 — the paper says
                      so for all four, and a twelve-year-old offered a status
                      of business is a form inviting an answer to a question
                      the census does not ask of a child.

                      Above fifteen, Q17 and Q18 still close when the income
                      is not from WORK: remittance, investments and "others"
                      go straight to Q19.
                    */}
                    <Coded
                      label="Q16 Source of income"
                      list={m.income_sources}
                      value={member.q16_income_source}
                      onChange={(v) => setMember(index, "q16_income_source", v)}
                      skipped={outOfBand(ageOf(member), 15)}
                      skippedNote="99 — under 15, so this is not asked."
                      hint={skipsToQ19(member) ? "Not from work — Q17 and Q18 are skipped." : undefined}
                    />
                    <Coded
                      label="Q17 Status of work / business"
                      list={m.work_statuses}
                      value={member.q17_work_status}
                      onChange={(v) => setMember(index, "q17_work_status", v)}
                      skipped={outOfBand(ageOf(member), 15) || skipsToQ19(member)}
                      skippedNote={
                        outOfBand(ageOf(member), 15)
                          ? "99 — under 15, so this is not asked."
                          : "99 — the income is not from work. SKIP TO Q19."
                      }
                    />
                    <Text
                      label="Q18 Place of work"
                      hint="Barangay and city/municipality"
                      maxLength={80}
                      value={member.q18_work_place}
                      onChange={(v) => setMember(index, "q18_work_place", v)}
                      disabled={outOfBand(ageOf(member), 15) || skipsToQ19(member)}
                      disabledNote={
                        outOfBand(ageOf(member), 15)
                          ? "99 — under 15, so this is not asked."
                          : "99 — the income is not from work. SKIP TO Q19."
                      }
                    />
                  </Section>

                  <Section
                    title="Q19–Q21 · Infant health"
                    note="0 to 11 months"
                    progress={progressOf(
                      // Under one year old: an age in whole years of 0.
                      inBand(ageOf(member), 0, 0)
                        ? [
                            "q19_delivery_place",
                            isOther(member.q19_delivery_place, m.delivery_places) && "q19_other",
                            "q20_birth_attendant",
                            isOther(member.q20_birth_attendant, m.birth_attendants) && "q20_other",
                            "q21_immunization",
                          ]
                        : [],
                      member
                    )}
                  >
                    <Coded label="Q19 Place of delivery" list={m.delivery_places} value={member.q19_delivery_place} onChange={(v) => setMember(index, "q19_delivery_place", v)} />
                    <Text
                      label="Q19 If others, specify"
                      maxLength={80}
                      value={member.q19_other}
                      onChange={(v) => setMember(index, "q19_other", v)}
                      disabled={!isOther(member.q19_delivery_place, m.delivery_places)}
                      disabledNote="Only when the place is not on the list."
                    />
                    <Coded label="Q20 Birth attendant" list={m.birth_attendants} value={member.q20_birth_attendant} onChange={(v) => setMember(index, "q20_birth_attendant", v)} />
                    <Text
                      label="Q20 If others, specify"
                      maxLength={80}
                      value={member.q20_other}
                      onChange={(v) => setMember(index, "q20_other", v)}
                      disabled={!isOther(member.q20_birth_attendant, m.birth_attendants)}
                      disabledNote="Only when the attendant is not on the list."
                    />
                    <Text label="Q21 Last vaccine received" hint="From the baby book or immunisation card." maxLength={80} value={member.q21_immunization} onChange={(v) => setMember(index, "q21_immunization", v)} />
                  </Section>

                  <Section
                    title="Q22–Q25 · Family planning"
                    note="women 10 to 54"
                    progress={progressOf(
                      inBand(ageOf(member), 10, 54) && maybeWoman(member, m.sexes)
                        ? [
                            "q22_pregnancies",
                            String(member.q22_pregnancies ?? "") !== "0" && "q22_living_children",
                            "q23_fp_method",
                            "q24_fp_source",
                            isOther(member.q24_fp_source, m.fp_sources) && "q24_other",
                            "q25_fp_intention", "q25_detail",
                          ]
                        : [],
                      member
                    )}
                  >
                    {/*
                      One cell on the paper, split by a diagonal: pregnancies
                      in the upper triangle, children still living in the
                      lower. Two boxes here, because a triangle is not a
                      thing a screen has.
                    */}
                    <Text
                      label="Q22 Pregnancies"
                      hint="Total she has had, ever. If none, write 0."
                      digits={3}
                      value={member.q22_pregnancies}
                      onChange={(v) => setMember(index, "q22_pregnancies", v)}
                    />
                    <Text
                      label="Q22 Children still living"
                      hint="As of today, not at birth."
                      digits={3}
                      value={member.q22_living_children}
                      onChange={(v) => setMember(index, "q22_living_children", v)}
                      disabled={String(member.q22_pregnancies ?? "") === "0"}
                      disabledNote="99 — no pregnancies, so none are living. SKIP TO Q23."
                    />
                    <Coded label="Q23 FP method in use" list={m.fp_methods} value={member.q23_fp_method} onChange={(v) => setMember(index, "q23_fp_method", v)} />
                    <Coded label="Q24 Where obtained" list={m.fp_sources} value={member.q24_fp_source} onChange={(v) => setMember(index, "q24_fp_source", v)} />
                    <Text
                      label="Q24 If another source, specify"
                      maxLength={80}
                      value={member.q24_other}
                      onChange={(v) => setMember(index, "q24_other", v)}
                      disabled={!isOther(member.q24_fp_source, m.fp_sources)}
                      disabledNote="Only when the source is not on the list."
                    />
                    {/*
                      Also one split cell. The Yes or No goes in the upper
                      triangle; what goes in the lower depends on it — the
                      METHOD after a Yes, the REASON after a No. One box, and
                      the label says which is wanted.
                    */}
                    <Coded label="Q25 Intend to use FP" list={m.yes_no} value={member.q25_fp_intention} onChange={(v) => setMember(index, "q25_fp_intention", v)} />
                    <Text
                      label={
                        String(member.q25_fp_intention ?? "") === "1"
                          ? "Q25 Which method"
                          : String(member.q25_fp_intention ?? "") === "2"
                            ? "Q25 Why not"
                            : "Q25 Which method, or why not"
                      }
                      hint={
                        String(member.q25_fp_intention ?? "") === "1"
                          ? "The method they intend to use."
                          : String(member.q25_fp_intention ?? "") === "2"
                            ? "Their reason for not intending to."
                            : "Answer Q25 and this asks for one or the other."
                      }
                      maxLength={80}
                      value={member.q25_detail}
                      onChange={(v) => setMember(index, "q25_detail", v)}
                    />
                  </Section>

                  <Section
                    title="Q26–Q29 · Health"
                    note="all members"
                    progress={progressOf([
                      "q26_health_insurance",
                      isOther(member.q26_health_insurance, m.health_insurance) && "q26_other",
                      "q27_facility_visited",
                      isOther(member.q27_facility_visited, m.facilities) && "q27_other",
                      "q28_visit_reason",
                      isOther(member.q28_visit_reason, m.visit_reasons) && "q28_other",
                      "q29_disability",
                    ], member)}
                  >
                    <Coded label="Q26 Health insurance" list={m.health_insurance} value={member.q26_health_insurance} onChange={(v) => setMember(index, "q26_health_insurance", v)} />
                    <Text
                      label="Q26 If others, specify"
                      maxLength={80}
                      value={member.q26_other}
                      onChange={(v) => setMember(index, "q26_other", v)}
                      disabled={!isOther(member.q26_health_insurance, m.health_insurance)}
                      disabledNote="Only when the insurer is not on the list."
                    />
                    <Coded label="Q27 Facility visited (12 months)" list={m.facilities} value={member.q27_facility_visited} onChange={(v) => setMember(index, "q27_facility_visited", v)} />
                    <Text
                      label="Q27 If another facility, specify"
                      maxLength={80}
                      value={member.q27_other}
                      onChange={(v) => setMember(index, "q27_other", v)}
                      disabled={!isOther(member.q27_facility_visited, m.facilities)}
                      disabledNote="Only when the facility is not on the list."
                    />
                    <Coded label="Q28 Reason for the visit" list={m.visit_reasons} value={member.q28_visit_reason} onChange={(v) => setMember(index, "q28_visit_reason", v)} />
                    <Text
                      label="Q28 If another reason, specify"
                      maxLength={80}
                      value={member.q28_other}
                      onChange={(v) => setMember(index, "q28_other", v)}
                      disabled={!isOther(member.q28_visit_reason, m.visit_reasons)}
                      disabledNote="Only when the reason is not on the list."
                    />
                    <Coded label="Q29 Disability" list={m.disabilities} value={member.q29_disability} onChange={(v) => setMember(index, "q29_disability", v)} />
                  </Section>

                  <Section
                    title="Q30–Q32 · Socio-civic participation"
                    /*
                      Three questions with three different age bands, so this
                      one is counted question by question rather than as a
                      block.
                    */
                    progress={progressOf([
                      inBand(ageOf(member), 10) && "q30_solo_parent",
                      inBand(ageOf(member), 60) && "q31_senior_registered",
                      inBand(ageOf(member), 15) && "q32_voter_barangay",
                    ], member)}
                  >
                    <Coded label="Q30 Solo parent" hint="10 and above" list={m.solo_parent} value={member.q30_solo_parent} onChange={(v) => setMember(index, "q30_solo_parent", v)} />
                    <Coded label="Q31 Registered senior citizen" hint="60 and above" list={m.yes_no} value={member.q31_senior_registered} onChange={(v) => setMember(index, "q31_senior_registered", v)} />
                    <VoterField
                      value={member.q32_voter_barangay}
                      onChange={(v) => setMember(index, "q32_voter_barangay", v)}
                    />
                  </Section>

                  <Section
                    title="Q33–Q41 · Migration"
                    note="5 and above"
                    progress={progressOf(
                      inBand(ageOf(member), 5)
                        ? [
                            "q33_residence_5yrs", "q34_residence_6mos",
                            "q35_stay_years", "q35_stay_months", "q36_resident_type",
                            /*
                              The paper: for Q37 to Q41, if non-migrant,
                              write 99. Somebody who has always lived here
                              has no transfer date and no reason for leaving
                              anywhere, so none of these nine are asked.
                            */
                            ...(isNonMigrant(member)
                              ? []
                              : [
                                  "q37_transfer_month", "q37_transfer_year",
                                  "q38a_leave_reason",
                                  // B and C close once A is Others.
                                  !isOther(member.q38a_leave_reason, m.leave_reasons) &&
                                    "q38b_leave_reason",
                                  !isOther(member.q38a_leave_reason, m.leave_reasons) &&
                                    "q38c_leave_reason",
                                  (isOther(member.q38a_leave_reason, m.leave_reasons) ||
                                    isOther(member.q38b_leave_reason, m.leave_reasons) ||
                                    isOther(member.q38c_leave_reason, m.leave_reasons)) &&
                                    "q38_other",
                                  "q39_will_return", "q39_when",
                                  "q40a_transfer_reason", "q40b_transfer_reason",
                                  "q40c_transfer_reason", "q40_other",
                                  "q41_intends_to_stay",
                                  // No date after a No, and none before an answer.
                                  String(member.q41_intends_to_stay ?? "") === "1" && "q41_until",
                                ]),
                          ]
                        : [],
                      member
                    )}
                  >
                    <Text label="Q33 Residence 5 years ago" maxLength={80} value={member.q33_residence_5yrs} onChange={(v) => setMember(index, "q33_residence_5yrs", v)} />
                    <Text label="Q34 Residence 6 months ago" maxLength={80} value={member.q34_residence_6mos} onChange={(v) => setMember(index, "q34_residence_6mos", v)} />
                    {/*
                      The paper heads this pair "LENGTH OF STAY IN THE
                      BARANGAY". "…and months" on its own said nothing —
                      months of what, next to a box that had scrolled out of
                      sight — so each box carries the question.
                    */}
                    <Text
                      label="Q35 Length of stay — years"
                      hint="How long they have lived in this barangay."
                      digits={3}
                      value={member.q35_stay_years}
                      onChange={(v) => setMember(index, "q35_stay_years", v)}
                    />
                    <Text
                      label="Q35 Length of stay — months"
                      hint="The part-year on top of the years above. 0 to 11 — twelve months is a year."
                      digits={2}
                      max={11}
                      value={member.q35_stay_months}
                      onChange={(v) => setMember(index, "q35_stay_months", v)}
                    />
                    {/*
                      Q36 is worked out, not asked — the paper is explicit:
                      non-migrant when both previous residences are this
                      barangay; migrant when one of them is not and the stay
                      is over six months; transient when it is under. Left
                      open when Q33 to Q35 do not yet say, because a guess
                      here sends eight questions to 99 for somebody who
                      should have answered them.
                    */}
                    <Coded
                      label="Q36 Type of resident"
                      list={m.resident_types}
                      value={member.q36_resident_type ?? residentTypeFrom(member) ?? ""}
                      onChange={(v) => setMember(index, "q36_resident_type", v)}
                      hint={
                        residentTypeFrom(member)
                          ? "Worked out from Q33–Q35. Change it if the household says otherwise."
                          : "Answer Q33–Q35 and this fills itself."
                      }
                    />

                    {/*
                      NOTE on the paper: for Q37 to Q41, if non-migrant,
                      write 99. Somebody who has always lived here did not
                      transfer, has no reason for leaving anywhere, and has
                      no date to give.
                    */}
                    <MonthYear
                      label="Q37 Transfer month and year"
                      hint="When they moved into this barangay."
                      value={joinMonthYear(member.q37_transfer_month, member.q37_transfer_year)}
                      onChange={(v) => {
                        const { month, year } = splitMonthYear(v);
                        setMember(index, "q37_transfer_month", month);
                        setMember(index, "q37_transfer_year", year);
                      }}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, so there was no transfer."
                    />

                    {/*
                      Three DIFFERENT reasons, so each box drops what the one
                      before it took. And "Others" in the A box ends the
                      question: what the other reason was goes in the box
                      below, not into two more dropdowns.
                    */}
                    <Coded
                      label="Q38A Reason for leaving"
                      list={m.leave_reasons}
                      value={member.q38a_leave_reason}
                      onChange={(v) => setMember(index, "q38a_leave_reason", v)}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, so nowhere was left."
                    />
                    <Coded
                      label="Q38B Reason for leaving"
                      list={without(m.leave_reasons, [member.q38a_leave_reason])}
                      value={member.q38b_leave_reason}
                      onChange={(v) => setMember(index, "q38b_leave_reason", v)}
                      skipped={isNonMigrant(member) || isOther(member.q38a_leave_reason, m.leave_reasons)}
                      skippedNote={
                        isNonMigrant(member)
                          ? "99 — non-migrant, so nowhere was left."
                          : "Q38A is Others — say what it was in the box below."
                      }
                    />
                    <Coded
                      label="Q38C Reason for leaving"
                      list={without(m.leave_reasons, [member.q38a_leave_reason, member.q38b_leave_reason])}
                      value={member.q38c_leave_reason}
                      onChange={(v) => setMember(index, "q38c_leave_reason", v)}
                      skipped={isNonMigrant(member) || isOther(member.q38a_leave_reason, m.leave_reasons)}
                      skippedNote={
                        isNonMigrant(member)
                          ? "99 — non-migrant, so nowhere was left."
                          : "Q38A is Others — say what it was in the box below."
                      }
                    />
                    <Text
                      label="Q38 If another reason, specify"
                      maxLength={80}
                      value={member.q38_other}
                      onChange={(v) => setMember(index, "q38_other", v)}
                      disabled={
                        !isOther(member.q38a_leave_reason, m.leave_reasons) &&
                        !isOther(member.q38b_leave_reason, m.leave_reasons) &&
                        !isOther(member.q38c_leave_reason, m.leave_reasons)
                      }
                      disabledNote="Only when one of Q38A–C is Others."
                    />
                    <Coded
                      label="Q39 Will return"
                      list={m.yes_no}
                      value={member.q39_will_return}
                      onChange={(v) => setMember(index, "q39_will_return", v)}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, so there is nowhere to return to."
                    />
                    <MonthYear
                      label="Q39 When"
                      value={String(member.q39_when ?? "")}
                      onChange={(v) => setMember(index, "q39_when", v)}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, so there is nowhere to return to."
                    />
                    <Coded
                      label="Q40A Reason for transferring here"
                      list={m.transfer_reasons}
                      value={member.q40a_transfer_reason}
                      onChange={(v) => setMember(index, "q40a_transfer_reason", v)}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, so there was no transfer."
                    />
                    <Coded
                      label="Q40B Reason for transferring here"
                      list={without(m.transfer_reasons, [member.q40a_transfer_reason])}
                      value={member.q40b_transfer_reason}
                      onChange={(v) => setMember(index, "q40b_transfer_reason", v)}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, so there was no transfer."
                    />
                    <Coded
                      label="Q40C Reason for transferring here"
                      list={without(m.transfer_reasons, [member.q40a_transfer_reason, member.q40b_transfer_reason])}
                      value={member.q40c_transfer_reason}
                      onChange={(v) => setMember(index, "q40c_transfer_reason", v)}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, so there was no transfer."
                    />
                    {/*
                      Q40 has no "Others" code on the paper — the note says
                      "if other reason/s, write the response", so the box is
                      always open.
                    */}
                    <Text label="Q40 Any other reason" maxLength={80} value={member.q40_other} onChange={(v) => setMember(index, "q40_other", v)} />
                    <Coded
                      label="Q41 Intends to stay"
                      list={m.yes_no}
                      value={member.q41_intends_to_stay}
                      onChange={(v) => setMember(index, "q41_intends_to_stay", v)}
                      skipped={isNonMigrant(member)}
                      skippedNote="99 — non-migrant, and already staying."
                    />
                    {/*
                      "Until when" only means something after a Yes. After a
                      No there is no date to give, and the paper says 99.
                    */}
                    <MonthYear
                      label="Q41 Until when"
                      value={String(member.q41_until ?? "")}
                      onChange={(v) => setMember(index, "q41_until", v)}
                      skipped={
                        isNonMigrant(member) || String(member.q41_intends_to_stay ?? "") === "2"
                      }
                      skippedNote={
                        isNonMigrant(member)
                          ? "99 — non-migrant, and already staying."
                          : "99 — they do not intend to stay, so there is no date."
                      }
                      disabled={!member.q41_intends_to_stay}
                      disabledNote="Answer Q41 first."
                    />
                  </Section>

                  <Section
                    title="Q42–Q44 · Community tax & skills"
                    progress={progressOf([
                      inBand(ageOf(member), 18) && "q42a_has_ctc",
                      // No CTC, nothing to have been issued here. SKIP TO Q43.
                      inBand(ageOf(member), 18) &&
                        String(member.q42a_has_ctc ?? "") !== "2" &&
                        "q42b_ctc_here",
                      inBand(ageOf(member), 15) && "q43_training_interest",
                      inBand(ageOf(member), 15) &&
                        isOther(member.q43_training_interest, m.trainings) &&
                        "q43_other",
                      // NOTE on the paper: for Q43 and Q44, if 0–14, write 99.
                      inBand(ageOf(member), 15) && "q44_skill",
                      inBand(ageOf(member), 15) &&
                        isOther(member.q44_skill, m.skills) &&
                        "q44_other",
                    ], member)}
                  >
                    <Coded
                      label="Q42A Has a valid CTC"
                      hint="18 and above"
                      list={m.yes_no}
                      value={member.q42a_has_ctc}
                      onChange={(v) => setMember(index, "q42a_has_ctc", v)}
                      skipped={outOfBand(ageOf(member), 18)}
                      skippedNote="99 — under 18."
                    />
                    {/*
                      "Was it issued here" has no answer when there is no
                      CTC. The paper: if No, write the answer and SKIP TO Q43.
                    */}
                    <Coded
                      label="Q42B Issued in this barangay"
                      list={m.yes_no}
                      value={member.q42b_ctc_here}
                      onChange={(v) => setMember(index, "q42b_ctc_here", v)}
                      skipped={
                        outOfBand(ageOf(member), 18) || String(member.q42a_has_ctc ?? "") === "2"
                      }
                      skippedNote={
                        outOfBand(ageOf(member), 18)
                          ? "99 — under 18."
                          : "99 — no CTC to have been issued. SKIP TO Q43."
                      }
                    />
                    <Coded
                      label="Q43 Training interested in"
                      hint="15 and above"
                      list={m.trainings}
                      value={member.q43_training_interest}
                      onChange={(v) => setMember(index, "q43_training_interest", v)}
                      skipped={outOfBand(ageOf(member), 15)}
                      skippedNote="99 — under 15."
                    />
                    <Text
                      label="Q43 If another training, specify"
                      maxLength={80}
                      value={member.q43_other}
                      onChange={(v) => setMember(index, "q43_other", v)}
                      disabled={!isOther(member.q43_training_interest, m.trainings)}
                      disabledNote="Only when the training is not on the list."
                    />
                    <Coded
                      label="Q44 Most prominent skill"
                      hint="15 and above"
                      list={m.skills}
                      value={member.q44_skill}
                      onChange={(v) => setMember(index, "q44_skill", v)}
                      skipped={outOfBand(ageOf(member), 15)}
                      skippedNote="99 — under 15."
                    />
                    <Text
                      label="Q44 If others, specify"
                      maxLength={80}
                      value={member.q44_other}
                      onChange={(v) => setMember(index, "q44_other", v)}
                      disabled={!isOther(member.q44_skill, m.skills)}
                      disabledNote="Only when the skill is not on the list."
                    />
                  </Section>
                </fieldset>

                {/*
                  Whether this line becomes a resident record when the form is
                  submitted.

                  Line 1 has no switch: it is the household head, and there is
                  no household without one. The rest are on by default and can
                  be turned off, because a census records who was in the house
                  that evening — a visiting cousin from the next barangay
                  belongs on the sheet without belonging on this register.
                */}
                {(member.first_name || member.last_name) && (
                  <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    {index === 0 ? (
                      <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <FiCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Registered as a resident — the household head always is.
                      </p>
                    ) : (
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          // Absent means yes: a line the office has not
                          // touched is one they mean to register.
                          checked={Number(member.register_as_resident ?? 1) === 1}
                          onChange={(e) =>
                            setMemberFlag(index, "register_as_resident", e.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                        />
                        <span>
                          <span className="block text-xs font-semibold text-dark">
                            Register as a resident
                          </span>
                          <span className="block text-xs text-gray-500">
                            Submitting the form puts them on the barangay register. Turn this
                            off for somebody who was in the house but lives elsewhere.
                          </span>
                        </span>
                      </label>
                    )}

                    {matches[index] && (
                      <p className="mt-2 text-xs text-gray-500">
                        On the register as{" "}
                        <Link
                          to={`/residents/${matches[index]!.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {matches[index]!.resident_number}
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {(
            <button
              type="button"
              onClick={() => setMembers((p) => [...p, { ...BLANK_MEMBER }])}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray py-3 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" /> Add another household member
            </button>
          )}
        </Card>

        {/* ------------------- H. HOUSEHOLD QUESTIONS ------------------- */}
        <Card title="H. Questions for the household">
          <fieldset>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Coded label="Q45 Housing unit" list={h.tenures} value={form.q45_housing_tenure as number} onChange={(v) => set("q45_housing_tenure", v)} />
              <Coded label="Q46 Lot" list={h.tenures} value={form.q46_lot_tenure as number} onChange={(v) => set("q46_lot_tenure", v)} />
              <Coded label="Q47 Fuel for lighting" list={h.lighting_fuels} value={form.q47_lighting_fuel as number} onChange={(v) => set("q47_lighting_fuel", v)} />
              <Text
                label="Q47 If others, specify"
                maxLength={80}
                value={form.q47_other as string}
                onChange={(v) => set("q47_other", v)}
                disabled={!isOther(form.q47_lighting_fuel, h.lighting_fuels)}
                disabledNote="Only when the fuel is not on the list."
              />
              <Coded label="Q48 Fuel for cooking" list={h.cooking_fuels} value={form.q48_cooking_fuel as number} onChange={(v) => set("q48_cooking_fuel", v)} />
              <Text
                label="Q48 If others, specify"
                maxLength={80}
                value={form.q48_other as string}
                onChange={(v) => set("q48_other", v)}
                disabled={!isOther(form.q48_cooking_fuel, h.cooking_fuels)}
                disabledNote="Only when the fuel is not on the list."
              />
              <Coded label="Q49 Drinking water" list={h.water_sources} value={form.q49_water_source as number} onChange={(v) => set("q49_water_source", v)} />
              <Text
                label="Q49 If others, specify"
                maxLength={80}
                value={form.q49_other as string}
                onChange={(v) => set("q49_other", v)}
                disabled={!isOther(form.q49_water_source, h.water_sources)}
                disabledNote="Only when the source is not on the list."
              />
              <Coded label="Q50a Kitchen garbage" list={h.garbage_disposal} value={form.q50a_garbage_disposal as number} onChange={(v) => set("q50a_garbage_disposal", v)} />
              <Coded label="Q50b Segregates garbage" list={h.yes_no} value={form.q50b_segregates as number} onChange={(v) => set("q50b_segregates", v)} />
              <Coded label="Q51 Toilet facility" list={h.toilets} value={form.q51_toilet as number} onChange={(v) => set("q51_toilet", v)} />
              <Text
                label="Q51 If others, specify"
                maxLength={80}
                value={form.q51_other as string}
                onChange={(v) => set("q51_other", v)}
                disabled={!isOther(form.q51_toilet, h.toilets)}
                disabledNote="Only when the facility is not on the list."
              />
              <Coded label="Q52 Type of building" hint="Observed, not asked." list={h.building_types} value={form.q52_building_type as number} onChange={(v) => set("q52_building_type", v)} />
              <Coded label="Q53 Outer wall material" hint="Observed, not asked." list={h.outer_walls} value={form.q53_outer_wall as number} onChange={(v) => set("q53_outer_wall", v)} />
              <Text
                label="Q53 If others, specify"
                maxLength={80}
                value={form.q53_other as string}
                onChange={(v) => set("q53_other", v)}
                disabled={!isOther(form.q53_outer_wall, h.outer_walls)}
                disabledNote="Only when the material is not on the list."
              />

              {/*
                Four questions the paper gives a fixed number of blanks and
                life does not. A household can lose two people in a year and
                can name four diseases; recorded in three boxes, the fourth
                answer simply never happened.
              */}
              <DeathList
                label="Q54 Female deaths in the past 12 months"
                hint="Every woman in this household who died in the past year, whatever the cause."
                rows={listOf<DeathRow>("q54_female_deaths")}
                onChange={(next) => setList("q54_female_deaths", next)}
                addLabel="Add a death"
                maxAge={120}
              />
              <DeathList
                label="Q55 Deaths of children under five, past 12 months"
                rows={listOf<DeathRow>("q55_child_deaths")}
                onChange={(next) => setList("q55_child_deaths", next)}
                addLabel="Add a death"
                maxAge={5}
                sexes={m.sexes}
              />
              <StringList
                label="Q56 Most common diseases in the household"
                placeholder="e.g. Hypertension"
                values={listOf<string>("q56_common_diseases")}
                onChange={(next) => setList("q56_common_diseases", next)}
                addLabel="Add a disease"
              />
              <StringList
                label="Q57 Primary needs of the household"
                placeholder="e.g. Livelihood assistance"
                values={listOf<string>("q57_primary_needs")}
                onChange={(next) => setList("q57_primary_needs", next)}
                addLabel="Add a need"
              />

              <Text label="Q58 In 5 years — barangay" maxLength={80} value={form.q58_intend_barangay as string} onChange={(v) => set("q58_intend_barangay", v)} />
              <Text label="Q58 Municipality" maxLength={80} value={form.q58_intend_municipality as string} onChange={(v) => set("q58_intend_municipality", v)} />
              <Text label="Q58 Province" maxLength={80} value={form.q58_intend_province as string} onChange={(v) => set("q58_intend_province", v)} />
            </div>
          </fieldset>
        </Card>

        {/* ------------------- CONSENT + ENCODING ------------------- */}
        <Card title="Consent and encoding">
          <fieldset>
            <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4">
              <label className="inline-flex cursor-pointer items-start gap-2 text-sm text-dark">
                <input
                  type="checkbox"
                  checked={Boolean(form.consent_given)}
                  onChange={(e) => set("consent_given", e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                />
                <span>
                  The respondent gave consent to be interviewed and to the use of their data.
                  <span className="mt-1 block text-xs leading-relaxed text-gray-600">
                    The paper form carries a signature block, and the census may not be used
                    without it. A form cannot be submitted until this is recorded.
                  </span>
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Text label="Name on the consent" maxLength={80} value={form.consent_name as string} onChange={(v) => set("consent_name", v)} />
              <Text label="Date encoded" type="date" value={(form.date_encoded as string)?.slice(0, 10)} onChange={(v) => set("date_encoded", v)} />
              <Text label="Encoder" maxLength={80} value={form.encoder_name as string} onChange={(v) => set("encoder_name", v)} />
              <Text label="Supervisor" maxLength={80} value={form.supervisor_name as string} onChange={(v) => set("supervisor_name", v)} />
            </div>
          </fieldset>
        </Card>

        {/* ------------------- ACTIONS ------------------- */}
        {/*
          Two, because there are two things the office does: keep typing, and
          register the household. There is no third — no hand-over, because
          the hand-over was the BHW carrying paper through the door, and no
          separate review, because the office typing the sheet IS the review.
        */}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-full border border-gray bg-white px-8 py-3 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Save as draft"}
          </button>

          {/*
            Shown on a new form too.

            It used to appear only once a draft existed, so registering a
            household in one sitting was impossible: the office had to save,
            leave, and come back for the button. Pressing it on a new form
            now saves first and previews second.

            And it says PREVIEW, because that is what it does. Labelled
            "Submit — register this household" it promised the last step and
            delivered a dialogue, which is the kind of small lie that teaches
            somebody to click through dialogues without reading them.
          */}
          <button
            type="button"
            onClick={submitForm}
            disabled={saving || registering}
            className="cursor-pointer rounded-full bg-success px-8 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {status === "Submitted" ? "Preview and submit again" : "Preview form"}
          </button>
        </div>
      </form>
    </div>
  );
}
