import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FiArrowLeft, FiEdit2, FiPlus, FiX } from "react-icons/fi";
import { api, errorMessage, fieldErrors } from "../../lib/api";
import { toast } from "../../lib/toast";
import { showServerFieldErrors } from "../../lib/formErrors";
import { confirmAction } from "../../lib/confirm";
import Card from "../../components/UI/Card";
import Breadcrumbs from "../../components/UI/Breadcrumbs";
import PageHeader from "../../components/UI/PageHeader";
import NewHouseholdModal from "../../components/NewHouseholdModal";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ChoiceGroup from "../../components/UI/ChoiceGroup";
import ResidentPicker from "../../components/ResidentPicker";
import ResidentFormFields, {
  RESIDENT_FORM_INITIAL,
  buildResidentPayload,
  type ResidentForm,
} from "../../components/ResidentFormFields";
import type { Household, Resident } from "../../types";

/**
 * Register a resident — and, in the same visit, everybody else in the house.
 *
 * This is the shape a house-to-house actually takes. The BHW knocks, the
 * owner answers, and the owner names everybody living there: one visit, one
 * conversation, one list. Registering the owner and then opening their
 * profile to add each person separately turns that visit into six forms, and
 * the six are what get abandoned halfway through.
 *
 * Members are optional. A newborn or somebody who moves in later is still
 * added from the resident's own profile, which is the right place for a
 * single person arriving on their own.
 *
 * Nothing is sent until the clerk has read it back. A name typed into a
 * registry is copied onto every certificate that person is ever issued, and
 * a misspelling caught on screen costs a second where one caught a year later
 * costs a correction request.
 */

/** How a member is related to the household owner. */
type MemberRelation = "spouse" | "child" | "parent" | "none";

const RELATIONS: { value: MemberRelation; label: string; hint: string }[] = [
  { value: "spouse", label: "Spouse / Partner", hint: "Recorded as a union; their children link to both." },
  { value: "child", label: "Child", hint: "Also recorded as the owner's spouse's child, if there is one." },
  { value: "parent", label: "Parent", hint: "The lola or lolo living in the house." },
  {
    value: "none",
    label: "Other household member",
    hint: "Registered into the house with NO family link. Use this for a grandchild, a nephew, a boarder — anyone whose exact relation is not one of the three above. The office records the real link afterwards, from their profile.",
  },
];

/**
 * The words a clerk may choose for a child or a parent.
 *
 * Left unset, the card says Son or Daughter from their sex — which is right
 * most of the time and wrong in exactly the cases that matter. A step-son and
 * an adopted daughter are not a guess the register should make on somebody's
 * behalf, so the words are offered.
 */
const CHILD_WORDS = ["Son", "Daughter", "Adopted"];
const PARENT_WORDS = ["Mother", "Father", "Guardian"];

/**
 * A word that says the child is somebody else's.
 *
 * The register must not then hand them a second parent: their own two are
 * recorded elsewhere, and inventing one here is how a step-son ends up on a
 * stranger's birth details.
 */
/** Father / Mother, or the neutral word when no sex is recorded yet. */
const parentWord = (gender: string): string =>
  gender === "Male" ? "Father" : gender === "Female" ? "Mother" : "Parent";

/**
 * A word that says the child's parentage is recorded elsewhere.
 *
 * Only adoption does now. The register does not model step relationships: a
 * parent's new spouse is recorded as their spouse, not as anything to the
 * child.
 */
const isAdopted = (word: string | null): boolean => word === "Adopted";

/** The words, plus the "work it out" answer, as answers to a question. */
const wordChoices = (words: string[], derived: string) => [
  { value: "", label: "From their sex", hint: derived },
  ...words.map((word) => ({ value: word, label: word })),
];

/*
 * Who the second parent is.
 *
 * The register has to be told. Attaching a child to whoever the owner
 * happens to be married to is a guess, and it is wrong exactly where it
 * matters most — a child from an earlier marriage, a child whose mother
 * works abroad, a grandchild being raised in the house.
 */
type OtherParentKind = "spouse" | "resident" | "outside" | "none";

interface OtherParent {
  kind: OtherParentKind;
  /** Already on the register. */
  resident: Resident | null;
  /** Living elsewhere — recorded lightly, as a non-resident. */
  first_name: string;
  middle_name: string;
  last_name: string;
  /** Optional, but it is what makes the child’s record say Mother. */
  gender: string;
  contact_number: string;
  address: string;
  /**
   * The clerk asked for a blank form instead of the search.
   *
   * A parent who lives elsewhere is usually already on file — the second
   * child by the same mother abroad is the ordinary case. Typing her again
   * makes a duplicate, and the register then holds two women who are one
   * person, with one child each. So the search comes first.
   */
  typing: boolean;
}

const BLANK_OTHER_PARENT: OtherParent = {
  kind: "spouse",
  resident: null,
  first_name: "",
  middle_name: "",
  last_name: "",
  gender: "",
  contact_number: "",
  address: "",
  typing: false,
};

interface Member {
  form: ResidentForm;
  manualSectors: string[];
  autoLength: boolean;
  /*
   * null until the clerk answers.
   *
   * Nothing here is pre-picked. A form that opens with "Child" already
   * chosen is a form that records a boarder as a son the moment somebody
   * fills in the name and moves on — and it looks answered, so nobody
   * checks it. An unanswered question is the only honest starting state.
   */
  relation: MemberRelation | null;
  /** Son / Daughter / Adopted — "" means "work it out from their sex". */
  relationship: string | null;
  /**
   * A family member who does NOT live here: a mother working in Riyadh, a
   * father in Cebu. The owner names them in the same breath as everybody
   * else, and leaving them out is what makes a family record half a family.
   * They are recorded lightly — no purok, no sector, no portal account, and
   * not counted in the population.
   */
  livesOutside: boolean | null;
  /** For a child: who the second parent is. Null until asked. */
  otherParent: OtherParent | null;
  /**
   * Married, or living together.
   *
   * Null until asked, and it has to be asked: the record says "Husband" or
   * "Wife" off the back of this, and calling a live-in partner somebody's
   * wife is the same false statement as putting Married in their civil
   * status. Everything registered here used to be recorded as a marriage.
   */
  unionType: string | null;
}

/** One person the server thinks may already be registered. */
interface DuplicateWarning {
  who: string;
  name: string;
  namesakes: { id: number; full_name?: string; resident_number?: string; zone_purok?: string }[];
}

/**
 * What an RBIM census line brings with it.
 *
 * A census records people the register has never heard of — that is what a
 * baseline census is for. Sending them here with a blank form meant typing
 * the whole household a second time, so the answers travel and the line
 * remembers where it came from.
 */
interface CensusHandoff {
  censusPrefill?: Partial<ResidentForm>;
  censusReturn?: { censusId: number; memberId: number; censusNo: string; line: number };
}

export default function ResidentCreate() {
  const handoff = (useLocation().state ?? null) as CensusHandoff | null;

  const [form, setForm] = useState<ResidentForm>({
    ...RESIDENT_FORM_INITIAL,
    ...(handoff?.censusPrefill ?? {}),
  });
  const [manualSectors, setManualSectors] = useState<string[]>([]);
  // When on, length of residence follows the age (years since birth) and the
  // field is locked; turning it off restores whatever was typed before.
  const [autoLength, setAutoLength] = useState(false);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [step, setStep] = useState<"form" | "preview">("form");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateWarning[] | null>(null);
  // Inline "register household" so the clerk doesn't have to leave the form.
  const [hhOpen, setHhOpen] = useState(false);
  // Opt-in: make the resident being registered the owner/head of the selected
  // household. Off by default so it is never set unless the clerk chooses to.
  const [makeOwner, setMakeOwner] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();

  const residentName = `${form.first_name} ${form.last_name}`.trim();

  const patch = (values: Partial<ResidentForm>) => setForm((prev) => ({ ...prev, ...values }));

  /**
   * Selecting a household fills the owner's purok from it — and everybody
   * else's. They live in the same house; asking again per person is asking
   * the same question five times.
   */
  const selectHousehold = (household: Household | null) => {
    setSelectedHousehold(household);
    setForm((prev) => ({
      ...prev,
      household_id: household ? String(household.id) : "",
      zone_purok: household?.zone_purok || prev.zone_purok,
    }));
    setMembers((prev) =>
      prev.map((m) => ({
        ...m,
        form: {
          ...m.form,
          household_id: household ? String(household.id) : "",
          zone_purok: household?.zone_purok || m.form.zone_purok,
        },
      }))
    );
    if (!household) setMakeOwner(false); // no household → nothing to own
  };

  const toggleSector = (sector: string) =>
    setManualSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );

  const addMember = () =>
    setMembers((prev) => [
      ...prev,
      {
        form: {
          ...RESIDENT_FORM_INITIAL,
          /*
           * The house carries over; the SURNAME does not. Households share an
           * address, not a name — a married daughter, a step-child, a boarder
           * all carry their own. Filling it in is a guess that gets saved as
           * fact the moment nobody notices it.
           */
          household_id: form.household_id,
          zone_purok: form.zone_purok,
          residency_status: form.residency_status,
        },
        manualSectors: [],
        autoLength: false,
        relation: null,
        relationship: null,
        livesOutside: null,
        otherParent: null,
        unionType: null,
      },
    ]);

  /*
   * Whether a partner is being registered alongside the owner. Only then is
   * "the owner's spouse" an answer the form can offer — the owner is new, so
   * there is no existing marriage to fall back on.
   */
  const hasSpouse = members.some((m) => m.relation === "spouse");

  // The partner being registered alongside the owner, so the child blocks can
  // name them instead of saying "the spouse".
  const spouseMember = members.find((m) => m.relation === "spouse");
  const spouseName = spouseMember
    ? `${spouseMember.form.first_name} ${spouseMember.form.last_name}`.trim()
    : "";
  const spouseGender = spouseMember?.form.gender ?? "";

  const setMember = (index: number, changes: Partial<Member>) =>
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...changes } : m)));

  const patchMember = (index: number, values: Partial<ResidentForm>) =>
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, form: { ...m.form, ...values } } : m))
    );

  /** Everything the clerk typed, in the shape the server takes it. */
  const payload = (confirmNamesakes: boolean) => ({
    confirm_namesakes: confirmNamesakes || undefined,
    make_household_head: makeOwner && !!form.household_id,
    head: buildResidentPayload(form, manualSectors, autoLength),
    members: members.map((m) => ({
      relation: m.relation,
      relationship: m.relationship || undefined,
      union_type: m.relation === "spouse" ? (m.unionType ?? undefined) : undefined,
      // Only sent for a child, and only once answered — the server keeps its
      // own presumption for anything it is not told about.
      other_parent:
        m.relation === "child" && m.otherParent && !isAdopted(m.relationship)
          ? {
              /*
               * Picking somebody from the search means linking them, not
               * making a second record of them — so it goes as "resident"
               * whichever list they were found in.
               */
              kind:
                m.otherParent.kind === "outside" && m.otherParent.resident
                  ? "resident"
                  : m.otherParent.kind,
              resident_id: m.otherParent.resident?.id,
              first_name: m.otherParent.first_name || undefined,
              middle_name: m.otherParent.middle_name || undefined,
              last_name: m.otherParent.last_name || undefined,
              gender: m.otherParent.gender || undefined,
              contact_number: m.otherParent.contact_number || undefined,
              address: m.otherParent.address || undefined,
            }
          : undefined,
      ...(m.livesOutside
        ? {
            // Only what the barangay needs to reach somebody living elsewhere.
            record_type: "Non-resident",
            first_name: m.form.first_name,
            middle_name: m.form.middle_name || undefined,
            last_name: m.form.last_name,
            suffix: m.form.suffix || undefined,
            gender: m.form.gender || undefined,
            contact_number: m.form.contact_number || undefined,
            address: m.form.address || undefined,
          }
        : buildResidentPayload(m.form, m.manualSectors, m.autoLength)),
    })),
  });

  const register = async (confirmNamesakes: boolean) => {
    setError("");
    setSaving(true);
    try {
      const response = await api.post("/residents/household", payload(confirmNamesakes));
      const created = response.data.data.head.id;

      /*
       * Back to the census, with the line joined up.
       *
       * Without this the office registers somebody and the census line still
       * says nobody — two records of one person and nothing connecting them,
       * which is the state the whole reconciliation step exists to prevent.
       * The registration itself already succeeded, so a failure here is
       * reported and not raised: the person exists either way.
       */
      const back = handoff?.censusReturn;

      if (back) {
        try {
          await api.put(`/rbim/${back.censusId}/members/${back.memberId}`, {
            resident_id: created,
          });
          toast(`Registered, and line ${back.line} of ${back.censusNo} now points to them.`);
        } catch {
          toast(
            `Registered — but line ${back.line} of ${back.censusNo} could not be matched. Match it on the census form.`,
            "warning"
          );
        }

        navigate(`/population/rbim/${back.censusId}`);
        return;
      }

      navigate(`/residents/${created}`);
    } catch (err) {
      const found = (err as { response?: { status?: number; data?: { errors?: { possible_duplicates?: DuplicateWarning[] } } } })
        .response;

      // 409 = somebody in this household may already be registered. Shown on
      // the preview, all of them at once, so it is one decision and not six.
      if (found?.status === 409 && found.data?.errors?.possible_duplicates) {
        setDuplicates(found.data.errors.possible_duplicates);
        setError(errorMessage(err));
        setSaving(false);
        return;
      }

      // A field problem sends them back to fix it — a preview they cannot
      // edit is a dead end.
      setStep("form");
      const shownInline = showServerFieldErrors(formRef.current, fieldErrors(err));
      setError(shownInline ? "" : errorMessage(err));
      setSaving(false);
    }
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    /*
     * Nothing is pre-picked, so nothing may be skipped.
     *
     * The browser enforces the typed fields on its own, but these are
     * buttons — it has nothing to check. Left unanswered they would reach
     * the server as "no relation", and a household would be registered as
     * six unrelated people living at one address.
     */
    const unanswered = members.findIndex(
      (m) =>
        m.relation === null ||
        (m.relation !== "none" && m.livesOutside === null) ||
        (m.relation === "spouse" && m.unionType === null) ||
        (m.relation === "child" &&
          !isAdopted(m.relationship) &&
          !hasSpouse &&
          m.otherParent === null)
    );

    if (unanswered !== -1) {
      const who =
        `${members[unanswered].form.first_name} ${members[unanswered].form.last_name}`.trim();

      setError(
        `Person ${unanswered + 1}${who ? " (" + who + ")" : ""} still has a question unanswered. ` +
          "Every household member needs their relation, where they live, and — for a spouse " +
          "or a child — whether they are married and who the other parent is."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setError("");
    setDuplicates(null);
    setStep("preview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const total = members.length + 1;

  /** How the chosen other parent reads back on the preview. */
  const otherParentName = (member: Member): string => {
    const parent = member.otherParent;
    if (!parent) return "—";

    if (parent.kind === "spouse") {
      const spouse = members.find((m) => m.relation === "spouse");
      const name = spouse
        ? `${spouse.form.first_name} ${spouse.form.last_name}`.trim()
        : "";
      // Named, not just "the spouse" — the point of a preview is to be read.
      return name || `${residentName || "the owner"}’s spouse`;
    }

    if (parent.kind === "resident") {
      return parent.resident?.full_name ?? "nobody chosen";
    }

    if (parent.kind === "outside") {
      const name = `${parent.first_name} ${parent.last_name}`.trim();
      return (name || "unnamed") + " (outside the barangay)";
    }

    return "not recorded";
  };

  /* ------------------------------------------------------------------ */

  const Line = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="flex gap-2 text-xs">
      <dt className="w-32 shrink-0 text-gray-400">{label}</dt>
      <dd className={value ? "text-dark" : "text-gray-300"}>{value || "—"}</dd>
    </div>
  );

  const personSummary = (
    person: ResidentForm,
    sectors: string[],
    heading: string,
    badge?: string,
    key?: number
  ) => (
    <div key={key ?? "head"} className="rounded-2xl border border-gray p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-dark">
          {[person.first_name, person.middle_name, person.last_name, person.suffix]
            .filter(Boolean)
            .join(" ") || "(no name entered)"}
        </p>
        <span className="flex items-center gap-2">
          {badge && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              {badge}
            </span>
          )}
          <span className="text-[11px] uppercase tracking-wide text-gray-400">{heading}</span>
        </span>
      </div>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        <Line label="Sex" value={person.gender} />
        <Line label="Birthdate" value={person.birthdate} />
        <Line label="Civil status" value={person.civil_status} />
        <Line label="Place of birth" value={person.birth_place} />
        <Line label="Occupation" value={person.occupation} />
        <Line label="Contact" value={person.contact_number} />
        <Line label="Email" value={person.email} />
        <Line label="Purok" value={person.zone_purok} />
        <Line label="Residency" value={person.residency_status} />
        <Line label="Education" value={person.educational_attainment} />
        <Line label="Sectors" value={sectors.join(", ")} />
      </dl>
      {person.email ? (
        <p className="mt-3 rounded-lg bg-secondary/70 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
          A portal account will be emailed to <strong>{person.email}</strong>.
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-gray-400">
          No email — no portal account. One can be issued later from their profile.
        </p>
      )}
    </div>
  );

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
        title={step === "preview" ? "Check before registering" : "Register Resident"}
        subtitle={
          step === "preview"
            ? "Read it back before it goes on the register — a misspelling here is copied onto every certificate."
            : "Register the household owner and, in the same visit, everybody living with them"
        }
        actions={
          <button
            type="button"
            onClick={() => (step === "preview" ? setStep("form") : navigate("/residents"))}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
          >
            <FiArrowLeft aria-hidden="true" /> {step === "preview" ? "Back to the form" : "Back"}
          </button>
        }
      />

      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium leading-relaxed text-danger">
          {error}
        </p>
      )}

      {step === "preview" ? (
        <div className="space-y-4">
          {/*
            Everybody the server thinks is already on the register, together.
            Asked one at a time, the fourth prompt is answered without being
            read — which is worse than not asking.
          */}
          {duplicates && duplicates.length > 0 && (
            <Card>
              <p className="mb-3 text-sm font-bold text-warning">
                Check these before continuing
              </p>
              <div className="space-y-3">
                {duplicates.map((entry) => (
                  <div key={entry.who} className="rounded-xl bg-warning/10 px-4 py-3">
                    <p className="text-sm font-semibold text-dark">
                      {entry.name}{" "}
                      <span className="font-normal text-gray-500">({entry.who})</span>
                    </p>
                    <ul className="mt-2 space-y-1">
                      {entry.namesakes.map((n) => (
                        <li key={n.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-dark">
                            {n.full_name}
                            {n.resident_number ? ` · ${n.resident_number}` : ""}
                            {n.zone_purok ? ` · ${n.zone_purok}` : ""}
                          </span>
                          <Link
                            to={`/residents/${n.id}`}
                            target="_blank"
                            className="shrink-0 font-semibold text-primary hover:underline"
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-500">
                If these are genuinely different people, continue. If one of them is the same
                person, go back and remove them from this household — registering them twice
                splits their records, and the split has to be repaired later.
              </p>
            </Card>
          )}

          <Card>
            <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm text-dark">
              <strong>{total}</strong> {total === 1 ? "person" : "people"} will be added to the
              registry
              {selectedHousehold
                ? ` in household ${selectedHousehold.household_number}`
                : " with no household set"}
              .
            </p>

            <div className="space-y-3">
              {personSummary(
                form,
                manualSectors,
                "Household owner",
                makeOwner ? "Set as owner" : undefined
              )}
              {members.map((m, index) => (
                <div key={index}>
                  {personSummary(
                    m.form,
                    m.livesOutside ? [] : m.manualSectors,
                    m.relationship ||
                      (RELATIONS.find((r) => r.value === m.relation)?.label ?? "Member"),
                    m.livesOutside
                      ? "Lives outside — not counted"
                      : m.relation === "none"
                        ? "No family link"
                        : undefined,
                    index
                  )}
                  {m.relation === "spouse" && m.unionType === "Live-in" && (
                    <p className="mt-1 pl-4 text-xs text-gray-500">
                      Recorded as <span className="font-semibold text-dark">living together</span>,
                      not married.
                    </p>
                  )}
                  {m.relation === "child" && m.otherParent && (
                    <p className="mt-1 pl-4 text-xs text-gray-500">
                      Other parent: <span className="font-semibold text-dark">{otherParentName(m)}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-gray bg-white py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
              >
                <FiEdit2 className="h-4 w-4" aria-hidden="true" /> Something is wrong — go back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (
                    !(await confirmAction({
                      title:
                        total === 1
                          ? `Register ${residentName}?`
                          : `Register all ${total} people?`,
                      text: "They will be added to the resident registry with their family links.",
                      confirmText: "Yes, register",
                    }))
                  )
                    return;
                  // Duplicates already shown and read: confirming here is the
                  // clerk saying these are different people.
                  await register(duplicates !== null);
                }}
                className="flex-1 cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {saving
                  ? "Registering…"
                  : duplicates
                    ? "These are different people — register"
                    : `Confirm & register ${total === 1 ? "" : `all ${total}`}`.trim()}
              </button>
            </div>
          </Card>
        </div>
      ) : (
        <form ref={formRef} onSubmit={review}>
          <Card>
            {/* Registering someone now issues their portal login as well, so the
                clerk knows before they start why the email field matters. */}
            <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-xs leading-relaxed text-dark">
              <strong>A portal account is created automatically.</strong> If an email address is
              entered below, this resident is emailed their sign-in details right away. Their
              password is their <strong>last name + birthday (MMDDYY)</strong> — e.g. Cruz062702 —
              and they activate the account themselves with a code we email them at first sign-in.
            </p>

            {/* 3 columns on large screens so the whole form fits without scrolling */}
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <ResidentFormFields
                form={form}
                onChange={patch}
                manualSectors={manualSectors}
                onToggleSector={toggleSector}
                autoLength={autoLength}
                onAutoLengthChange={setAutoLength}
                selectedHousehold={selectedHousehold}
                onSelectHousehold={selectHousehold}
                onAddNewHousehold={() => setHhOpen(true)}
                householdExtra={
                  // Owner opt-in — sits under the household field, off by default.
                  form.household_id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setMakeOwner((v) => !v)}
                        aria-pressed={makeOwner}
                        className={`mt-2 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          makeOwner
                            ? "border-primary bg-primary text-white"
                            : "border-gray bg-white text-dark hover:border-primary hover:text-primary"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            makeOwner ? "border-white bg-white/20" : "border-gray"
                          }`}
                        >
                          {makeOwner ? "✓" : ""}
                        </span>
                        Set {residentName || "this resident"} as this household&apos;s owner (head)
                      </button>
                      {makeOwner && selectedHousehold?.head && (
                        <span className="mt-1 block text-xs text-warning">
                          Replaces the current owner: {selectedHousehold.head.first_name}{" "}
                          {selectedHousehold.head.last_name}
                        </span>
                      )}
                    </>
                  ) : undefined
                }
              />

            </div>
          </Card>

          {/* ---------- everybody else in the house ---------- */}
          <Card title="Others living in this house">
            <p className="mb-4 text-xs leading-relaxed text-gray-500">
              While the owner is in front of you, take everybody down at once. They share this
              household and purok automatically. Leave this empty if the owner lives alone — a
              newborn or somebody who moves in later is added from a resident&rsquo;s own profile,
              which is the right place for one person arriving on their own.
            </p>

            <div className="space-y-4">
              {members.map((member, index) => (
                <div key={index} className="rounded-2xl border border-gray bg-secondary/30 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-bold text-dark">
                      {index + 1}.{" "}
                      {`${member.form.first_name} ${member.form.last_name}`.trim() ||
                        "New household member"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-gray bg-white px-3 py-1 text-xs font-semibold text-gray-500 transition-colors hover:border-danger hover:text-danger"
                    >
                      <FiX className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </button>
                  </div>

                  <div className="mb-4">
                    <ChoiceGroup
                      label={`Who are they to ${residentName || "the owner"}?`}
                      value={member.relation}
                      onChange={(relation) =>
                        // A different relation makes the answers below stale:
                        // "Son" left over on somebody now recorded as a parent
                        // is worse than no answer at all.
                        setMember(index, {
                          relation,
                          relationship: null,
                          otherParent: null,
                                            unionType: null,
                        })
                      }
                      options={RELATIONS}
                      stretch={false}
                    />
                  </div>

                  {/*
                    Which word goes on the card. Left unset it is worked out
                    from their sex, which is right most of the time and wrong
                    in exactly the cases that matter — a step-son, an adopted
                    daughter, a guardian standing in for a parent.
                  */}
                  {member.relation === "spouse" && (
                    <div className="mb-4">
                      <ChoiceGroup
                        label="Are they married, or living together?"
                        value={member.unionType}
                        onChange={(unionType) => setMember(index, { unionType })}
                        options={[
                          {
                            value: "Married",
                            label: "Married",
                            hint: "The record will call them Husband or Wife.",
                          },
                          {
                            value: "Live-in",
                            label: "Living together",
                            hint:
                              "The record will call them Partner. Not a husband or a wife — " +
                              "saying so on a barangay record is the same false statement as " +
                              "putting Married in their civil status.",
                          },
                        ]}
                      />
                    </div>
                  )}

                  {(member.relation === "child" || member.relation === "parent") && (
                    <div className="mb-4">
                      <ChoiceGroup
                        label="What should the record call them?"
                        value={member.relationship}
                        onChange={(relationship) => setMember(index, { relationship })}
                        options={
                          member.relation === "child"
                            ? wordChoices(
                                CHILD_WORDS,
                                "Son or Daughter, from the sex recorded below."
                              )
                            : wordChoices(
                                PARENT_WORDS,
                                "Mother or Father, from the sex recorded below."
                              )
                        }
                        stretch={false}
                      />
                    </div>
                  )}

                  {/*
                    Family who do not live here. The owner names them in the
                    same breath — a mother working abroad, a father in the
                    next city — and leaving them out is what makes a family
                    record half a family. Not offered for "other household
                    member", which means somebody in the house by definition.
                  */}
                  {member.relation !== null && member.relation !== "none" && (
                    <div className="mb-4">
                      <ChoiceGroup
                        label="Where does this person live?"
                        value={member.livesOutside}
                        onChange={(livesOutside) => setMember(index, { livesOutside })}
                        options={[
                          { value: false, label: "In this house" },
                          {
                            value: true,
                            label: "Outside the barangay",
                            hint:
                              "Recorded so the family is complete, but NOT as a barangay resident: " +
                              "no purok, no sector, no portal account, and not counted in the " +
                              "population. Only a name, a number and where they are.",
                          },
                        ]}
                      />
                    </div>
                  )}

                  {/*
                    A child has two parents, and the register has to be told
                    who the second one is.

                    Attaching the child to whoever the owner happens to be
                    married to is a guess, and it is wrong in exactly the
                    cases that matter: a child from an earlier marriage, a
                    mother working abroad, a grandchild being raised in the
                    house. What comes out is a record naming the wrong person
                    as somebody's parent — and it is a certificate that says
                    it, not just a screen.

                    Not asked for a step-child or an adopted child: their own
                    parentage is recorded elsewhere and is not the owner's to
                    restate here.
                  */}
                  {/*
                    A plain child of a couple needs no question at all.

                    Both adults are on screen, both are being registered, and
                    the register can say who the parents are without asking.
                    The question stays for the case it exists for: a child by
                    somebody who is not the partner.
                  */}
                  {member.relation === "child" &&
                    !isAdopted(member.relationship) &&
                    hasSpouse &&
                    member.otherParent === null && (
                      <div className="mb-4 rounded-xl border border-gray bg-white p-4">
                        <p className="mb-2 text-sm font-medium text-dark">Parents</p>
                        <p className="text-xs leading-relaxed text-dark">
                          <span className="text-gray-500">{parentWord(form.gender)}:</span>{" "}
                          <span className="font-semibold">{residentName || "the owner"}</span>
                          <span className="mx-2 text-gray-400">·</span>
                          <span className="text-gray-500">{parentWord(spouseGender)}:</span>{" "}
                          <span className="font-semibold">{spouseName || "the spouse"}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setMember(index, {
                              otherParent: { ...BLANK_OTHER_PARENT, kind: "resident" },
                            })
                          }
                          className="mt-3 cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary"
                        >
                          This one has a different parent
                        </button>
                      </div>
                    )}

                  {member.relation === "child" &&
                    !isAdopted(member.relationship) &&
                    !(hasSpouse && member.otherParent === null) &&
                    (() => {
                      const parent = member.otherParent;
                      const patch = (changes: Partial<OtherParent>) =>
                        setMember(index, {
                          otherParent: { ...BLANK_OTHER_PARENT, ...parent, ...changes },
                        });

                      return (
                        <div className="mb-4">
                          <ChoiceGroup
                            label="Who is the child's other parent?"
                            value={parent?.kind ?? null}
                            onChange={(kind) => patch({ kind })}
                            options={[
                              ...(hasSpouse
                                ? [
                                    {
                                      value: "spouse" as OtherParentKind,
                                      label: (residentName || "The owner") + "’s spouse",
                                      hint: "The child is recorded as belonging to both of them.",
                                    },
                                  ]
                                : []),
                              {
                                value: "resident" as OtherParentKind,
                                label: "Someone on the register",
                                hint: "Search for them below; the child links to them as well.",
                              },
                              {
                                value: "outside" as OtherParentKind,
                                label: "Someone outside the barangay",
                                hint:
                                  "Recorded as a non-resident — a name and a contact, nothing " +
                                  "more — so the child’s parentage is complete without " +
                                  "counting them in the population.",
                              },
                              {
                                value: "none" as OtherParentKind,
                                label: "Not recorded",
                                hint:
                                  "One parent only. The second can be added later from the " +
                                  "child’s own profile.",
                              },
                            ]}
                            stretch={false}
                          />

                          {parent?.kind === "resident" && (
                            <div className="mt-3">
                              <p className="mb-1.5 text-xs font-medium text-gray-500">
                                The other parent
                              </p>
                              <ResidentPicker
                                value={parent.resident}
                                onChange={(resident) => patch({ resident })}
                                // The answer must not contradict the question:
                                // somebody living outside the barangay is not
                                // "on the register" in the sense meant here.
                                residentsOnly
                              />
                            </div>
                          )}

                          {parent?.kind === "outside" && !parent.typing && (
                            <div className="mt-3">
                              <p className="mb-2 text-xs leading-relaxed text-gray-500">
                                Search the people already recorded from outside the barangay — a
                                parent named for an earlier child is already here.
                              </p>
                              <ResidentPicker
                                value={parent.resident}
                                onChange={(resident) => patch({ resident })}
                                nonResidentsOnly
                              />
                              <button
                                type="button"
                                onClick={() => patch({ typing: true, resident: null })}
                                className="mt-3 cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary"
                              >
                                Not there — type their details
                              </button>
                            </div>
                          )}

                          {parent?.kind === "outside" && parent.typing && (
                            <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                              <FormField label="First name" required>
                                <input
                                  value={parent.first_name}
                                  onChange={(e) => patch({ first_name: e.target.value })}
                                  required
                                  className={inputClasses}
                                />
                              </FormField>
                              <FormField label="Last name" required>
                                <input
                                  value={parent.last_name}
                                  onChange={(e) => patch({ last_name: e.target.value })}
                                  required
                                  className={inputClasses}
                                />
                              </FormField>
                              <FormField
                                label="Sex"
                                hint="What makes the child’s record say Mother or Father."
                              >
                                <select
                                  value={parent.gender}
                                  onChange={(e) => patch({ gender: e.target.value })}
                                  className={inputClasses}
                                >
                                  <option value="">Not recorded</option>
                                  <option value="Female">Female</option>
                                  <option value="Male">Male</option>
                                </select>
                              </FormField>
                              <FormField label="Contact number">
                                <input
                                  value={parent.contact_number}
                                  onChange={(e) => patch({ contact_number: e.target.value })}
                                  className={inputClasses}
                                />
                              </FormField>
                              <FormField label="Where they live" hint="Town or city is enough.">
                                <input
                                  value={parent.address}
                                  onChange={(e) => patch({ address: e.target.value })}
                                  className={inputClasses}
                                  placeholder="e.g. Riyadh, Saudi Arabia"
                                />
                              </FormField>
                              <div className="sm:col-span-2">
                                <button
                                  type="button"
                                  onClick={() => patch({ typing: false })}
                                  className="cursor-pointer text-xs font-semibold text-primary hover:underline"
                                >
                                  Search the ones already recorded instead
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  {member.livesOutside ? (
                    <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                      <FormField label="First name" required>
                        <input
                          value={member.form.first_name}
                          onChange={(e) => patchMember(index, { first_name: e.target.value })}
                          required
                          className={inputClasses}
                        />
                      </FormField>
                      <FormField label="Middle name">
                        <input
                          value={member.form.middle_name}
                          onChange={(e) => patchMember(index, { middle_name: e.target.value })}
                          className={inputClasses}
                        />
                      </FormField>
                      <FormField label="Last name" required>
                        <input
                          value={member.form.last_name}
                          onChange={(e) => patchMember(index, { last_name: e.target.value })}
                          required
                          className={inputClasses}
                        />
                      </FormField>
                      <FormField label="Suffix">
                        <input
                          value={member.form.suffix}
                          onChange={(e) => patchMember(index, { suffix: e.target.value })}
                          className={inputClasses}
                          placeholder="Jr., Sr., III"
                        />
                      </FormField>
                      <FormField
                        label="Sex"
                        hint="What makes the record say Mother, Son, Daughter."
                      >
                        <select
                          value={member.form.gender}
                          onChange={(e) => patchMember(index, { gender: e.target.value })}
                          className={inputClasses}
                        >
                          <option value="">Not recorded</option>
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                        </select>
                      </FormField>
                      <FormField label="Contact number">
                        <input
                          value={member.form.contact_number}
                          onChange={(e) => patchMember(index, { contact_number: e.target.value })}
                          className={inputClasses}
                        />
                      </FormField>
                      <FormField label="Where they live" hint="Town or city is enough.">
                        <input
                          value={member.form.address}
                          onChange={(e) => patchMember(index, { address: e.target.value })}
                          className={inputClasses}
                          placeholder="e.g. Riyadh, Saudi Arabia"
                        />
                      </FormField>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <ResidentFormFields
                        form={member.form}
                        onChange={(values) => patchMember(index, values)}
                        manualSectors={member.manualSectors}
                        onToggleSector={(sector) =>
                          setMember(index, {
                            manualSectors: member.manualSectors.includes(sector)
                              ? member.manualSectors.filter((s) => s !== sector)
                              : [...member.manualSectors, sector],
                          })
                        }
                        autoLength={member.autoLength}
                        onAutoLengthChange={(value) => setMember(index, { autoLength: value })}
                        selectedHousehold={selectedHousehold}
                        onSelectHousehold={() => undefined}
                        // The house is the owner's — asking again per person is
                        // asking the same question five times.
                        showHousehold={false}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addMember}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray py-3 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" /> Add someone living in this house
            </button>

            {/*
              The end of the work, where the clerk's eye already is once the
              last person is entered — and on the right, where the button that
              moves you forward belongs.
            */}
            <div className="mt-6 flex justify-end border-t border-gray pt-5">
              <button
                type="submit"
                className="cursor-pointer rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Review {total === 1 ? "" : `all ${total} `}before registering
              </button>
            </div>
          </Card>
        </form>
      )}

      {/* Inline household registration */}
      <NewHouseholdModal
        open={hhOpen}
        onClose={() => setHhOpen(false)}
        onCreated={selectHousehold}
        defaultPurok={form.zone_purok}
      />
    </div>
  );
}
