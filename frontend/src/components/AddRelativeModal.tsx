import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FiPlus, FiX } from "react-icons/fi";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { showServerFieldErrors } from "../lib/formErrors";
import { confirmAction } from "../lib/confirm";
import { saveDraft, loadDraft, clearDraft, draftAge } from "../lib/formDraft";
import Modal from "./UI/Modal";
import FormField, { inputClasses } from "./UI/FormField";
import HouseholdPicker from "./UI/HouseholdPicker";
import PhoneInput from "./UI/PhoneInput";
import NewHouseholdModal from "./NewHouseholdModal";
import ResidentPicker from "./ResidentPicker";
import ChoiceGroup from "./UI/ChoiceGroup";
import ResidentFormFields, {
  RESIDENT_FORM_INITIAL,
  buildResidentPayload,
  type ResidentForm,
} from "./ResidentFormFields";
import NamesakeCheck, { namesakesFrom, type Namesake } from "./NamesakeCheck";
import { memberName } from "./FamilyPanel";
import type { Household, Resident } from "../types";

export type Relation = "parent" | "child" | "spouse" | "guardian";

/**
 * Why a child is not living with their parents.
 *
 * A list rather than free text, because this is a number the barangay is
 * asked for — how many children here are growing up with their parents away.
 * Must match Guardianship::REASONS on the server.
 */
const GUARDIAN_REASONS = [
  "Both parents work abroad (OFW)",
  "One parent works abroad (OFW)",
  "Parents work in another town or city",
  "Parents are deceased",
  "Parents are separated",
  "Parents cannot care for the child",
  "Other",
];

/**
 * Add parent / Add child / Add spouse.
 *
 * The relative is REGISTERED, not just named: the form is the same one used
 * to register any resident, so they get a resident number, sector tags and
 * their own portal account. Anything less would leave half a family outside
 * the registry, which is the thing this feature exists to fix.
 *
 * Several people are entered in ONE form, and they need not be alike: one
 * child may live with the parent, another two towns away. So WHERE SOMEONE
 * LIVES belongs to their own block, not to the batch — only the things that
 * are genuinely about the batch (who the other parent is, whether the couple
 * is married) are asked once at the top.
 */

const COPY: Record<Relation, { title: string; verb: string; plural: string; labelHint: string; labels: string[] }> = {
  parent: {
    title: "Add a parent",
    verb: "parent",
    plural: "parents",
    labelHint:
      "Optional — left unset, the card says Mother or Father from their sex. Set it for a guardian or a step-parent.",
    labels: ["Mother", "Father", "Guardian"],
  },
  child: {
    title: "Add a child",
    verb: "child",
    plural: "children",
    labelHint:
      "Optional — left unset, the card says Son or Daughter from their sex. Set it for a step-child or an adopted child.",
    labels: ["Son", "Daughter", "Adopted"],
  },
  spouse: {
    title: "Add a spouse",
    verb: "spouse",
    plural: "spouses",
    labelHint: "",
    labels: [],
  },
  /*
   * The lola, tita or neighbour a child was left with. Deliberately a
   * separate thing from a parent: recording a carer as a parent is what turns
   * her own children into the child's brothers and sisters.
   */
  guardian: {
    title: "Add a guardian",
    verb: "guardian",
    plural: "guardians",
    labelHint:
      "How they are related to the child — or that they are not related at all. Whoever the child was actually left with.",
    labels: [
      "Grandmother (Lola)",
      "Grandfather (Lolo)",
      "Aunt (Tita)",
      "Uncle (Tito)",
      "Elder sibling (Ate/Kuya)",
      "Other relative",
      "Family friend / neighbour",
      "Court-appointed guardian",
    ],
  },
};

/**
 * One person being entered. Everything here is theirs alone — including
 * whether they live in the barangay, so a batch can mix residents and
 * relatives from elsewhere.
 */
interface Entry {
  form: ResidentForm;
  manualSectors: string[];
  autoLength: boolean;
  label: string;
  /** For a step-parent: which existing parent they married. */
  /**
   * null until the clerk answers. NOT false: living in the barangay is the
   * commoner answer, but starting on it means the form already claims
   * something nobody said — and this answer decides which record the person
   * gets, resident or not, so it is not one to guess at.
   */
  livesOutside: boolean | null;
  /**
   * "" until the clerk answers — no button starts ticked.
   *
   * "guardian" is the case a child registry actually needs: the child does
   * not live with the parent being entered, they live with a lola or a tita.
   * The house comes from that person, and the guardianship is written in the
   * same step instead of being a second job to remember.
   */
  houseMode: "same" | "other" | "guardian" | "";
  household: Household | null;
  makeOwner: boolean;
  /**
   * Guardians only. A child left with a couple has two guardians and only one
   * of them answers the phone; the barangay needs to know which.
   */
  isPrimary: boolean;
  /*
   * THIS child's other parent. Not the batch's: brothers and sisters usually
   * share a mother, but a man registering his children may well be entering
   * two families at once, and forcing one answer on all of them meant coming
   * back and doing the whole form again for the second.
   */
  otherParentMode: "registry" | "outside";
  otherParent: Resident | null;
  outsideParent: {
    first_name: string;
    middle_name: string;
    last_name: string;
    contact_number: string;
    address: string;
  };
  /**
   * The clerk pressed "Different parent" on this child.
   *
   * The other parent is already settled for most children — the partner on
   * record — so the question stays folded away and the answer is simply
   * shown. Asking it in full on every child made the commonest case the
   * slowest one, and a question whose answer is already right is a question
   * that gets answered without being read.
   */
  changingParent: boolean;
  /**
   * The clerk pressed "Type their details instead".
   *
   * A parent who lives elsewhere is very often ALREADY on file — the second
   * child by the same mother abroad is the ordinary case. Typing her again
   * makes a duplicate of her, and then the two children have two different
   * mothers who are the same person. So the search comes first, and the
   * blank form is what you ask for when she genuinely is not there.
   */
  typingOutsideParent: boolean;
  /** Set once a non-resident other parent has been created, so a resumed
   *  save does not enter her twice. */
  outsideParentId: number | null;
  /** Which of the two is the mother, where sex cannot settle it. */
  motherIs: "subject" | "other" | "";
  /** Whoever the child was left with, when that is not the parent above. */
  guardian: Resident | null;
  guardianRelation: string;
  /**
   * Set once this person has been posted. A batch that fails halfway is
   * resumed, not restarted — without this, pressing save again would enter
   * the ones that already went through a second time.
   */
  saved?: boolean;
}

/**
 * Everything a half-finished batch consists of, kept as one piece.
 *
 * Restoring only part of it would be worse than restoring none: a clerk who
 * sees three children come back but not the mother they were being linked to
 * would have to check every field before trusting any of it.
 */
interface Draft {
  entries: Entry[];
  unionType: "Married" | "Live-in";
  /*
   * Facts about the CHILD, not about any one guardian: why the parents are
   * not raising them, and since when. Two guardians of the same child share
   * both, so asking twice would be asking the same question twice.
   */
  guardianReason: string;
  guardianStartedOn: string;
  /**
   * What a new marriage does to the children the subject ALREADY has.
   *
   * "none" by default, and the default writes nothing: a marriage is between
   * two people, and the children one of them already has are not part of it.
   * The other two answers are the clerk's to give, never the register's to
   * assume — that assumption is what put a second wife on the first wife's
   * children as their mother.
   */
  existingChildren: "none" | "shared" | "step";
}

interface Props {
  open: boolean;
  relation: Relation;
  /** The resident whose profile this was opened from. */
  resident: Resident;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function AddRelativeModal({ open, relation, resident, onClose, onSaved }: Props) {
  const copy = COPY[relation];

  /* ---- genuinely shared by the batch ---- */
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existing, setExisting] = useState<Resident | null>(null);
  const [unionType, setUnionType] = useState<"Married" | "Live-in">("Married");
  /* ---- guardianship, shared by everyone in the batch ---- */
  const [guardianReason, setGuardianReason] = useState("");
  const [guardianStartedOn, setGuardianStartedOn] = useState("");
  const [existingChildren, setExistingChildren] = useState<"none" | "shared" | "step">("none");

  /* ---- one per person ---- */
  const [entries, setEntries] = useState<Entry[]>([]);
  // Which block opened the "register a household" dialog.
  const [hhForIndex, setHhForIndex] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [namesakes, setNamesakes] = useState<Namesake[] | null>(null);
  // Which block the namesake dialog is asking about, so saving resumes there.
  const [pendingIndex, setPendingIndex] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const subjectHousehold = (resident.household as Household | null) ?? null;

  /** What a new block may inherit from the one before it. */
  type EntrySeed = Partial<Omit<Entry, "form">> & { form?: Partial<ResidentForm> };

  /** A fresh block, living with the subject until told otherwise. */
  const blankEntry = (seed: EntrySeed = {}): Entry => ({
    form: {
      ...RESIDENT_FORM_INITIAL,
      /*
       * A CHILD's surname is never assumed. Which surname a child carries is
       * a real decision — the father's, the mother's, or the father's with
       * the mother's as the middle name — and pre-filling one quietly makes
       * that decision for the family. A parent usually does share the surname
       * already on the record, so it is offered and can be typed over.
       */
      last_name: relation === "parent" ? resident.last_name : "",
      /*
       * No household, and therefore no purok, until the clerk says which. The
       * purok belongs to the house, so it fills itself the moment the house
       * is chosen — and stays open until then rather than showing an answer
       * nobody gave.
       */
      household_id: "",
      zone_purok: "",
      ...(seed.form ?? {}),
    },
    manualSectors: [],
    autoLength: false,
    label: "",
    livesOutside: seed.livesOutside ?? null,
    houseMode: seed.houseMode ?? "",
    household: seed.household ?? null,
    makeOwner: false,
    isPrimary: seed.isPrimary ?? true,
    changingParent: seed.changingParent ?? false,
    typingOutsideParent: seed.typingOutsideParent ?? false,
    otherParentMode: seed.otherParentMode ?? "registry",
    // The partner on record is the usual answer for the first child, and
    // wrong often enough that it stays changeable on every one of them.
    otherParent: seed.otherParent ?? ((resident.spouse as Resident | null) ?? null),
    outsideParent: seed.outsideParent ?? {
      first_name: "", middle_name: "", last_name: "", contact_number: "", address: "",
    },
    outsideParentId: seed.outsideParentId ?? null,
    motherIs: seed.motherIs ?? "",
    guardian: seed.guardian ?? null,
    guardianRelation: seed.guardianRelation ?? "",
  });

  /** This form's own draft — one per subject and relation. */
  const draftKey = `add-relative:${resident.id}:${relation}`;
  /** The form as it looks untouched, so a draft of nothing is never kept. */
  const pristineRef = useRef("");
  /** Set the moment a batch goes in, so the draft is not written back. */
  const doneRef = useRef(false);
  /** What was last written, so an unchanged form is not written again. */
  const lastWrittenRef = useRef("");
  /** When the restored draft was typed, or null if this form is fresh. */
  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  const freshDraft = (): Draft => ({
    entries: [blankEntry()],
    unionType: "Married",
    guardianReason: "",
    guardianStartedOn: "",
    existingChildren: "none",
  });

  const applyDraft = (draft: Draft) => {
    setEntries(draft.entries);
    setUnionType(draft.unionType);
    setGuardianReason(draft.guardianReason ?? "");
    setGuardianStartedOn(draft.guardianStartedOn ?? "");
    setExistingChildren(draft.existingChildren ?? "none");
  };

  useEffect(() => {
    if (!open) return;
    /*
     * The lola is almost always already registered — very often as the head
     * of the household the child was entered into — so the guardian form
     * opens on "find them" rather than sending the clerk through a whole
     * registration for somebody the barangay already knows.
     */
    setMode(relation === "guardian" ? "existing" : "new");
    setExisting(null);
    setError("");
    setNamesakes(null);
    setPendingIndex(0);
    setHhForIndex(null);
    doneRef.current = false;

    const fresh = freshDraft();
    pristineRef.current = JSON.stringify(fresh);

    /*
     * Anything left from last time comes back. The dialog closes on a click
     * outside it and asks nothing first, so twenty minutes of typing must not
     * depend on the clerk's aim.
     */
    const kept = loadDraft<Draft>(draftKey);
    if (kept && Array.isArray(kept.value.entries) && kept.value.entries.length > 0) {
      applyDraft(kept.value);
      // Already on disk, exactly as it is about to be in state — writing it
      // straight back would only reset its age and lie about when it was typed.
      lastWrittenRef.current = JSON.stringify(kept.value);
      setSavedNames(
        kept.value.entries
          .filter((entry) => entry.saved)
          .map((entry) => `${entry.form.first_name} ${entry.form.last_name}`.trim())
      );
      setRestoredAt(kept.savedAt);
      return;
    }

    applyDraft(fresh);
    lastWrittenRef.current = "";
    setSavedNames([]);
    setRestoredAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, relation, resident.id]);

  /*
   * Written on every change, because the work has to be safe BEFORE the stray
   * click, not rescued after it. A form still sitting at its opening state is
   * not a draft, and clearing it here is what stops a mere look-and-close from
   * coming back as "picked up where you left off".
   */
  useEffect(() => {
    if (!open || doneRef.current || entries.length === 0) return;

    const current: Draft = {
      entries, unionType, guardianReason, guardianStartedOn, existingChildren,
    };

    const serialised = JSON.stringify(current);

    if (serialised === pristineRef.current) {
      clearDraft(draftKey);
      lastWrittenRef.current = "";
      return;
    }
    if (serialised === lastWrittenRef.current) return;

    lastWrittenRef.current = serialised;
    saveDraft(draftKey, current);
  }, [
    open, draftKey, entries, unionType, guardianReason, guardianStartedOn, existingChildren,
  ]);

  /** Throws the restored draft away and starts the form over. */
  const discardDraft = async () => {
    if (
      !(await confirmAction({
        title: "Start over?",
        text: "What was typed before is deleted and the form starts empty.",
        confirmText: "Yes, start over",
      }))
    )
      return;

    const fresh = freshDraft();
    pristineRef.current = JSON.stringify(fresh);
    applyDraft(fresh);
    clearDraft(draftKey);
    lastWrittenRef.current = "";
    setSavedNames([]);
    setRestoredAt(null);
  };

  const updateEntry = (index: number, changes: Partial<Entry>) =>
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)));

  const patchForm = (index: number, values: Partial<ResidentForm>) =>
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, form: { ...entry.form, ...values } } : entry))
    );

  const addEntry = () =>
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        blankEntry({
          /*
           * Only the SURNAME carries over — siblings share one, and typing it
           * again is pure repetition. Everything else is asked afresh: which
           * house this person lives in is a question about THEM, and carrying
           * the last answer forward is how the second child silently inherits
           * a household nobody chose for them.
           */
          form: { last_name: last.form.last_name },
          // The first guardian entered is the contact unless the clerk says
          // otherwise; the second one is not, by default.
          isPrimary: false,
          /*
           * The other parent carries over because the next child is usually a
           * full sibling — but it is shown on THIS child's block and changed
           * there, which is the whole point: half-siblings can now be entered
           * in one go instead of one form each.
           */
          otherParentMode: last.otherParentMode,
          otherParent: last.otherParent,
          outsideParent: { ...last.outsideParent },
          outsideParentId: last.outsideParentId,
          motherIs: last.motherIs,
        }),
      ];
    });

  const removeEntry = (index: number) =>
    setEntries((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  /** Picks a household for ONE block, and keeps its purok in step. */
  const selectHousehold = (index: number, household: Household | null) =>
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              household,
              makeOwner: household ? entry.makeOwner : false,
              form: {
                ...entry.form,
                household_id: household ? String(household.id) : "",
                // Clearing the household clears its purok with it.
                zone_purok: household?.zone_purok ?? "",
              },
            }
          : entry
      )
    );

  const chooseHouseMode = (index: number, next: Entry["houseMode"]) =>
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== index) return entry;
        // "same" takes the subject's house; anything else clears it, so the
        // purok below opens up again instead of keeping a stale answer.
        const household = next === "same" ? subjectHousehold : null;
        return {
          ...entry,
          houseMode: next,
          household,
          makeOwner: false,
          // The guardian belongs to that one answer. Switching away drops
          // them rather than quietly keeping a carer nobody is claiming.
          guardian: next === "guardian" ? entry.guardian : null,
          guardianRelation: next === "guardian" ? entry.guardianRelation : "",
          form: {
            ...entry.form,
            household_id: household ? String(household.id) : "",
            /*
             * Cleared, never carried over. Coming back from "same household"
             * the purok still on screen is the SUBJECT's, and leaving it
             * there has the form answering for a house nobody has picked yet.
             */
            zone_purok: household?.zone_purok ?? "",
          },
        };
      })
    );

  /**
   * The person the child actually lives with. Their purok becomes the
   * child's, because a child is filed where they sleep — the household
   * itself is resolved on the server, from the carer's own record.
   */
  const chooseGuardian = (index: number, person: Resident | null) =>
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              guardian: person,
              form: {
                ...entry.form,
                household_id: "",
                zone_purok: person?.zone_purok || "",
              },
            }
          : entry
      )
    );

  /**
   * A house has one head. Ticking it here unticks anyone else in the batch
   * claiming the SAME house — two people cannot both own it, and silently
   * letting the last one win is how the wrong name ends up on the household.
   */
  const toggleOwner = (index: number) =>
    setEntries((prev) => {
      const target = prev[index];
      const turningOn = !target.makeOwner;
      return prev.map((entry, i) => {
        if (i === index) return { ...entry, makeOwner: turningOn };
        if (turningOn && entry.household?.id === target.household?.id) {
          return { ...entry, makeOwner: false };
        }
        return entry;
      });
    });

  /* ---- child naming ---- */
  const surnameOf = (person: { last_name?: string } | null) => person?.last_name?.trim() || "";
  const nameOf = (person: { first_name?: string; last_name?: string } | null) =>
    person ? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() : "";

  /** One child's second parent, whether picked from the register or typed in. */
  const otherParentOf = (entry: Entry) =>
    entry.otherParentMode === "outside"
      ? entry.outsideParent.first_name || entry.outsideParent.last_name
        ? {
            first_name: entry.outsideParent.first_name,
            last_name: entry.outsideParent.last_name,
            gender: null,
          }
        : null
      : entry.otherParent;

  /**
   * Who is the mother and who is the father, for THIS child.
   *
   * Worked out from sex where both are on the register, asked outright where
   * it cannot be — a parent recorded from outside the barangay has a name and
   * a number, not a sex — and it is what the surname choices rest on.
   */
  const parentsOf = (entry: Entry) => {
    const other = otherParentOf(entry);
    const derived =
      resident.gender === "Female" ? "subject" : other?.gender === "Female" ? "other" : "";
    const side = entry.motherIs || derived;

    return {
      other,
      derived,
      side,
      mother: side === "subject" ? resident : side === "other" ? other : null,
      father: side === "subject" ? other : side === "other" ? resident : null,
    };
  };

  const canNamePattern = (entry: Entry) => {
    const { other, mother, father } = parentsOf(entry);
    return relation === "child" && !!other && !!mother && !!father;
  };

  /** One of the ways a child's name may lawfully be composed. */
  const applyNamePattern = (index: number, pattern: "father" | "mother" | "father-only") => {
    const { mother, father } = parentsOf(entries[index]);

    if (pattern === "father") {
      // RA 9255: the father's surname, with the mother's as the middle name.
      patchForm(index, { middle_name: surnameOf(mother), last_name: surnameOf(father) });
    } else if (pattern === "mother") {
      patchForm(index, { middle_name: "", last_name: surnameOf(mother) });
    } else {
      patchForm(index, { middle_name: "", last_name: surnameOf(father) });
    }
  };

  /* ---- saving ---- */
  const payloadFor = (entry: Entry, confirmNamesake: boolean, otherParentId: number | null) => {
    const base = entry.livesOutside === true
      ? {
          // Only what the barangay needs to reach someone who lives elsewhere.
          record_type: "Non-resident",
          first_name: entry.form.first_name,
          middle_name: entry.form.middle_name || undefined,
          last_name: entry.form.last_name,
          suffix: entry.form.suffix || undefined,
          contact_number: entry.form.contact_number || undefined,
          address: entry.form.address || undefined,
        }
      : buildResidentPayload(entry.form, entry.manualSectors, entry.autoLength);

    const payload: Record<string, unknown> = { ...base };

    if (relation !== "spouse" && entry.label) payload.relationship = entry.label;
    if (entry.makeOwner && entry.livesOutside === false) payload.make_household_head = true;
    if (relation === "spouse") {
      payload.union_type = unionType;
      // "none" is what the server does anyway; sending it changes nothing.
      if (existingChildren !== "none") payload.existing_children = existingChildren;
    }
    if (relation === "guardian") {
      payload.guardian_reason = guardianReason || undefined;
      payload.guardian_started_on = guardianStartedOn || undefined;
      payload.is_primary = entry.isPrimary;
    }
    if (relation === "child" && otherParentId) payload.other_parent_id = otherParentId;
    /*
     * The child lives with somebody who is not this parent. The server takes
     * the household from the guardian and records the guardianship in the
     * same request, so a child left with a lola is entered once, not twice.
     */
    if (relation === "child" && entry.guardian) {
      payload.guardian_id = entry.guardian.id;
      payload.guardian_relation = entry.guardianRelation || undefined;
      payload.guardian_reason = guardianReason || undefined;
    }
    if (confirmNamesake) payload.confirm_namesake = true;

    return payload;
  };

  /**
   * Saves the blocks in order, from `startIndex`.
   *
   * A namesake conflict pauses the run rather than failing the batch: the
   * dialog opens for that block, and confirming resumes from exactly there,
   * so the people already saved are never entered twice.
   */
  const saveFrom = async (startIndex: number, confirmIndex: number | null) => {
    setError("");
    setSaving(true);

    try {
      /*
       * Each child's own second parent is resolved as that child is reached —
       * the batch may hold two families, and it was resolving one answer for
       * all of them that made the clerk run the form twice.
       *
       * A non-resident mother typed onto several children is created ONCE:
       * her id is written back onto every block that named her, so a run
       * resumed after a namesake prompt does not enter her again either.
       */
      const created: Record<string, number> = {};

      for (let i = startIndex; i < entries.length; i++) {
        const entry = entries[i];
        // Already posted on an earlier attempt. Pressing save again after a
        // failure resumes the batch; it does not enter anyone twice.
        if (entry.saved) continue;

        const name = `${entry.form.first_name} ${entry.form.last_name}`.trim();
        let otherParentId = entry.outsideParentId ?? entry.otherParent?.id ?? null;

        if (
          relation === "child" &&
          entry.otherParentMode === "outside" &&
          !otherParentId &&
          entry.outsideParent.first_name &&
          entry.outsideParent.last_name
        ) {
          const key = `${entry.outsideParent.first_name}|${entry.outsideParent.middle_name}|${entry.outsideParent.last_name}`
            .toLowerCase();

          if (created[key]) {
            otherParentId = created[key];
          } else {
            try {
              const madeParent = await api.post("/residents", {
                record_type: "Non-resident",
                first_name: entry.outsideParent.first_name,
                middle_name: entry.outsideParent.middle_name || undefined,
                last_name: entry.outsideParent.last_name,
                contact_number: entry.outsideParent.contact_number || undefined,
                address: entry.outsideParent.address || undefined,
                confirm_namesake: true,
              });
              otherParentId = madeParent.data.data.id as number;
              created[key] = otherParentId;
            } catch (err) {
              setError(
                `The other parent for ${name || `${copy.verb} ${i + 1}`} could not be recorded: `
                  + errorMessage(err)
                  + (i > startIndex ? " The ones before them were saved." : " Nothing was saved.")
              );
              return;
            }
          }

          // Written back so a resumed run reuses her rather than making a second.
          const resolved = otherParentId;
          setEntries((prev) =>
            prev.map((e, j) =>
              j === i || (!e.saved && !e.outsideParentId
                && `${e.outsideParent.first_name}|${e.outsideParent.middle_name}|${e.outsideParent.last_name}`.toLowerCase() === key)
                ? { ...e, outsideParentId: resolved }
                : e
            )
          );
        }

        try {
          const response = await api.post(
            `/residents/${resident.id}/family/${relation}`,
            payloadFor(entry, confirmIndex === i, otherParentId)
          );
          onSaved(response.data.message);
          setSavedNames((prev) => [...prev, name]);
          setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, saved: true } : e)));
        } catch (err) {
          const found = namesakesFrom(err);

          if (found) {
            setPendingIndex(i);
            setNamesakes(found);
            return; // wait for the clerk to decide, then resume here
          }

          const shownInline = showServerFieldErrors(formRef.current, fieldErrors(err));
          setError(
            (shownInline ? "" : errorMessage(err)) +
              (i > startIndex ? ` (${name} was not saved; the ones before them were.)` : "")
          );
          return;
        }
      }

      // The whole batch is in. There is nothing left to come back to.
      doneRef.current = true;
      clearDraft(draftKey);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  /**
   * A relationship word that already says whose child this is.
   *
   * A step-child and an adopted child have their own parentage recorded
   * elsewhere; naming a second parent here would invent one for a child who
   * already has two. So the question is not asked for those.
   */
  const saysSomebodyElses = (label?: string) => label === "Adopted";

  /**
   * The other parent's id, creating the non-resident record first when the
   * clerk typed somebody who lives elsewhere.
   *
   * Shared by both paths. Asking only when registering a NEW child meant a
   * child already on the register could never be given their second parent —
   * the commonest case of all, because the child was usually entered first.
   */
  const resolveOtherParent = async (entry: Entry): Promise<number | null> => {
    if (relation !== "child" || saysSomebodyElses(entry.label)) return null;

    const known = entry.outsideParentId ?? entry.otherParent?.id ?? null;
    if (entry.otherParentMode === "registry" || known) return known;

    if (!entry.outsideParent.first_name || !entry.outsideParent.last_name) return null;

    const made = await api.post("/residents", {
      record_type: "Non-resident",
      first_name: entry.outsideParent.first_name,
      middle_name: entry.outsideParent.middle_name || undefined,
      last_name: entry.outsideParent.last_name,
      contact_number: entry.outsideParent.contact_number || undefined,
      address: entry.outsideParent.address || undefined,
      confirm_namesake: true,
    });

    return made.data.data.id as number;
  };

  /**
   * The other parent as it currently stands, for the folded-away line.
   *
   * Null means nothing is settled yet and the question has to be asked —
   * a resident with no partner on record, or an outside parent half typed.
   */
  const settledParent = (entry: Entry): { name: string; note: string } | null => {
    if (entry.otherParentMode === "registry") {
      if (!entry.otherParent) return null;

      const name = `${entry.otherParent.first_name} ${entry.otherParent.last_name}`.trim();
      const isSpouse = entry.otherParent.id === resident.spouse?.id;

      return {
        name,
        note: isSpouse
          ? `${resident.first_name}’s partner on record`
          : "on the barangay register",
      };
    }

    const name = `${entry.outsideParent.first_name} ${entry.outsideParent.last_name}`.trim();

    return name ? { name, note: "lives outside the barangay" } : null;
  };

  const saveExisting = async () => {
    if (!existing) return;
    setError("");
    setSaving(true);
    try {
      const otherParentId = entries[0] ? await resolveOtherParent(entries[0]) : null;

      const response = await api.post(`/residents/${resident.id}/family/link`, {
        relative_id: existing.id,
        relation,
        // Named here, the child is recorded on BOTH parents in one step.
        // Left unsaid, the server keeps its own presumption: the subject's
        // spouse, if they have one.
        other_parent_id: otherParentId ?? undefined,
        relationship: relation !== "spouse" ? entries[0]?.label || undefined : undefined,
        union_type: relation === "spouse" ? unionType : undefined,
        existing_children:
          relation === "spouse" && existingChildren !== "none" ? existingChildren : undefined,
        // Why the parents are not raising the child, and since when. Asked
        // on this path too, because linking the lola who was already on the
        // register is the commonest way a guardianship gets recorded.
        guardian_reason: relation === "guardian" ? guardianReason || undefined : undefined,
        guardian_started_on:
          relation === "guardian" ? guardianStartedOn || undefined : undefined,
        is_primary: relation === "guardian" ? entries[0]?.isPrimary ?? true : undefined,
      });
      onSaved(response.data.message);
      doneRef.current = true;
      clearDraft(draftKey);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === "existing") {
      if (!existing) return;
      if (
        !(await confirmAction({
          title: `Link ${existing.first_name} ${existing.last_name} as ${copy.verb}?`,
          confirmText: "Yes, link them",
        }))
      )
        return;
      await saveExisting();
      return;
    }

    /*
     * Where someone lives decides which record they get, so it is not left to
     * a default. Nothing below it is shown until it is answered, which is why
     * the browser's own required-field check cannot catch this one.
     */
    const unanswered = entries.findIndex((e) => e.livesOutside === null);
    if (unanswered !== -1) {
      setError(
        entries.length > 1
          ? `Answer "Where does this person live?" for ${copy.verb} ${unanswered + 1} before saving.`
          : `Answer "Where does this person live?" before saving this ${copy.verb}.`
      );
      return;
    }

    const names = entries.map((e) => `${e.form.first_name} ${e.form.last_name}`.trim()).join(", ");

    if (
      !(await confirmAction({
        title:
          entries.length === 1
            ? `Register ${names} as ${copy.verb}?`
            : `Register ${entries.length} ${copy.plural}?`,
        text:
          entries.length === 1
            ? "They will be added to the resident registry with their own record."
            : `${names} will each be added to the registry with their own record.`,
        confirmText: "Yes, register & link",
      }))
    )
      return;

    await saveFrom(0, null);
  };

  const subjectName = `${resident.first_name} ${resident.last_name}`;
  // Their OWN children — step-children already belong to somebody else and
  // are not what this question is about.
  const existingKids = resident.children ?? [];
  const canAddMore = relation !== "spouse" && mode === "new";
  const pendingForm = entries[pendingIndex]?.form ?? RESIDENT_FORM_INITIAL;
  const mixedBatch =
    entries.length > 1 &&
    entries.some((e) => e.livesOutside === true) &&
    entries.some((e) => e.livesOutside === false);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          entries.length > 1
            ? `Add ${entries.length} ${copy.plural} for ${subjectName}`
            : `${copy.title} for ${subjectName}`
        }
        size="xl"
      >
        {error && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">{error}</p>
        )}
        {savedNames.length > 0 && (
          <p className="mb-4 rounded-xl bg-success/10 px-4 py-2.5 text-sm font-medium text-dark">
            Already saved: <strong>{savedNames.join(", ")}</strong>
          </p>
        )}

        {/*
          Said out loud, because a form that silently refills itself is
          unnerving — and because the clerk is the one who decides whether
          the old attempt is still the one they want.
        */}
        {restoredAt !== null && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/10 px-4 py-3">
            <p className="text-xs leading-relaxed text-dark">
              Picked up where you left off &mdash; this was typed {draftAge(restoredAt)} and kept
              when the dialog closed. It stays until you save it or log out.
            </p>
            <button
              type="button"
              onClick={discardDraft}
              className="shrink-0 cursor-pointer rounded-full border border-gray bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-danger hover:text-danger"
            >
              Start over
            </button>
          </div>
        )}

        <div className="mb-4 rounded-xl border border-gray p-4">
          <ChoiceGroup
            label={`Is this ${copy.verb} already in the registry?`}
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "new" as const,
                label: "No — register them",
                hint: `A new resident record is created and linked to ${subjectName}.`,
              },
              {
                value: "existing" as const,
                label: "Yes — find them",
                hint: "Only the family link is added. Nothing about their own record changes.",
              },
            ]}
          />
        </div>

        {/*
          The remarriage question, and the reason it is asked out loud.
          Recording a step-mother as a mother does not just print the wrong
          word: the child's grandparents, aunts, uncles and cousins are all
          read back off the parent links, so it hands them a family that is
          not theirs. Nothing in the record can settle it — only the clerk.
        */}
        {relation === "spouse" && existingKids.length > 0 && (
          <div className="mb-4 rounded-xl border border-gray p-4">
            <ChoiceGroup
              label={`What about ${subjectName}'s ${existingKids.length === 1 ? "existing child" : `${existingKids.length} existing children`}?`}
              hint={`Already on the record: ${existingKids.map(memberName).join(", ")}. This marriage does not change who their parents are.`}
              value={existingChildren}
              onChange={setExistingChildren}
              stretch={false}
              options={[
                {
                  value: "none" as const,
                  label: "Leave them as they are",
                  hint: "Nothing is written on those children. The marriage is recorded between the two adults, and that is all — which is what a remarriage actually is.",
                },
                {
                  value: "step" as const,
                  label: "Record as step-children",
                  hint: "Optional. The spouse appears on each child as a STEP-parent, in their own group. The children keep their own mother and father, and nothing on the family tree — grandparents, siblings, tita/tito, pinsan — is derived through a step link. You can also do this later, one child at a time, from the child's own profile.",
                },
                {
                  value: "shared" as const,
                  label: "They are this spouse's own children",
                  hint: "For a FIRST marriage whose children were entered before the wedding was recorded — the spouse really is their other parent. A child who already has both parents on record is given a step link instead, whatever is chosen here.",
                },
              ]}
            />
          </div>
        )}

        {relation === "child" && entries.some((e) => e.guardian) && (
          <div className="mb-4 rounded-xl border border-gray p-4">
            <FormField
              label="Why are these children not living with their parents?"
              hint="Recorded on each guardianship below. It is also what lets the barangay count how many children here are growing up with their parents away."
            >
              <select
                value={guardianReason}
                onChange={(e) => setGuardianReason(e.target.value)}
                className={inputClasses}
              >
                <option value="">Not recorded</option>
                {GUARDIAN_REASONS.map((reason) => (
                  <option key={reason}>{reason}</option>
                ))}
              </select>
            </FormField>
          </div>
        )}

        {relation === "guardian" && (
          <div className="mb-4 rounded-xl border border-gray p-4">
            <p className="mb-1 text-sm font-medium text-dark">
              Why is {subjectName} not living with their parents?
            </p>
            <p className="mb-3 text-xs leading-relaxed text-gray-400">
              This is about the child, not about the guardian &mdash; two guardians of the same
              child share it. It is also what lets the barangay count how many children here are
              growing up with their parents away.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Reason">
                <select
                  value={guardianReason}
                  onChange={(e) => setGuardianReason(e.target.value)}
                  className={inputClasses}
                >
                  <option value="">Not recorded</option>
                  {GUARDIAN_REASONS.map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Living with them since" hint="Roughly is fine — the month matters, not the day.">
                <input
                  type="date"
                  value={guardianStartedOn}
                  onChange={(e) => setGuardianStartedOn(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className={inputClasses}
                />
              </FormField>
            </div>

            <p className="mt-3 rounded-xl bg-secondary/70 px-4 py-2.5 text-xs leading-relaxed text-gray-600">
              A guardian is <strong>not</strong> added to the family tree. {subjectName}&rsquo;s
              parents stay their parents, wherever they are living, and the guardian&rsquo;s own
              children do not become {subjectName}&rsquo;s brothers and sisters.
            </p>
          </div>
        )}

        {/*
          The Add button is on the panel whether or not there is a spouse, so
          a clerk can always find it. What they cannot do is stack two open
          unions on one record, and being told that here — before typing a
          whole form — is the point of showing the button at all.
        */}
        {relation === "spouse" && resident.spouse && (
          <div className="mb-4 rounded-xl bg-warning/10 px-4 py-3">
            <p className="text-sm leading-relaxed text-dark">
              {subjectName} is still recorded as partnered with{" "}
              <strong>{memberName(resident.spouse)}</strong>. End that union first &mdash; on the{" "}
              <strong>Marriage &amp; partnership history</strong> card below, with the reason
              (separated, annulled, widowed) &mdash; and this one can then be added. The old union
              stays on the record, which is what explains an older certificate naming a different
              spouse.
            </p>
          </div>
        )}

        {relation === "spouse" && (
          <div className="mb-4 rounded-xl border border-gray p-4">
            {/*
              Living together is not marriage, and recording it as one puts
              something legally untrue on both records. Children belong to
              both either way, which is the part that matters here.
            */}
            <ChoiceGroup
              label="Are they married?"
              value={unionType}
              onChange={setUnionType}
              options={[
                {
                  value: "Married" as const,
                  label: "Married",
                  hint: `Both records are linked and both civil statuses become Married. Children already on ${subjectName}'s record become the spouse's too, and every child added from here on is automatically both of theirs.`,
                },
                {
                  value: "Live-in" as const,
                  label: "Live-in (not married)",
                  hint: "Recorded as partners, not married — their civil status is left alone, because living together does not change it. Their children still belong to both, so a child added to one is recorded on the other automatically.",
                },
              ]}
            />
          </div>
        )}

        <form ref={formRef} onSubmit={submit} className="space-y-4">
          {mode === "existing" ? (
            <>
              {relation !== "spouse" && (
                <FormField label="Relationship" hint={copy.labelHint}>
                  <select
                    value={entries[0]?.label ?? ""}
                    onChange={(e) => updateEntry(0, { label: e.target.value })}
                    className={inputClasses}
                  >
                    <option value="">Not specified</option>
                    {copy.labels.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label={`Find the ${copy.verb}`} required plain>
                <ResidentPicker value={existing} onChange={setExisting} excludeIds={[resident.id]} />
              </FormField>
              <p className="rounded-xl bg-secondary px-4 py-2.5 text-xs text-gray-500">
                Search the registry by name or resident number. Nothing about their record
                changes — only the family link is added, so their own household stays as it is.
              </p>

              {/*
                The other parent, for a child ALREADY on the register.

                This was only ever asked when registering a new child — but
                the child is usually entered first and linked to a parent
                afterwards, so the commonest case of all had no way to name
                the second parent. Without it the server falls back to the
                subject’s spouse, which is a guess, and wrong for exactly the
                families that need it: an earlier marriage, a mother abroad.

                Not asked for a step-child or an adopted child: the word
                already says the child is somebody else’s.
              */}
              {relation === "child" && !saysSomebodyElses(entries[0]?.label) && (
                <div className="rounded-xl border border-gray bg-white p-4">
                  <p className="mb-1 text-sm font-medium text-dark">
                    This child&rsquo;s other parent{" "}
                    <span className="font-normal text-gray-400">&mdash; not the child</span>
                  </p>
                  <p className="mb-3 text-xs leading-relaxed text-gray-400">
                    Optional. Named here, the child is recorded on BOTH parents at once. Left
                    blank, only {subjectName} is recorded as their parent
                    {resident.spouse ? " — along with their spouse, if the child is theirs too" : ""}.
                  </p>

                  {/* Settled by default here too — same reasoning, same button. */}
                  {entries[0] && settledParent(entries[0]) && !entries[0].changingParent ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/70 px-4 py-3">
                      <p className="text-xs leading-relaxed text-dark">
                        <span className="font-semibold">{settledParent(entries[0])!.name}</span>
                        <span className="mx-2 text-gray-400">·</span>
                        <span className="text-gray-500">{settledParent(entries[0])!.note}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => updateEntry(0, { changingParent: true })}
                        className="shrink-0 cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary"
                      >
                        This one has a different parent
                      </button>
                    </div>
                  ) : (
                  <>
                  <div className="mb-3">
                    <ChoiceGroup
                      label="Is the other parent on the barangay register?"
                      value={entries[0]?.otherParentMode ?? "registry"}
                      onChange={(value) =>
                        updateEntry(0, { otherParentMode: value, outsideParentId: null })
                      }
                      options={[
                        { value: "registry" as const, label: "Yes — find them" },
                        { value: "outside" as const, label: "No — record them here" },
                      ]}
                    />
                  </div>

                  {(entries[0]?.otherParentMode ?? "registry") === "registry" ? (
                    <ResidentPicker
                      value={entries[0]?.otherParent ?? null}
                      onChange={(person) => updateEntry(0, { otherParent: person })}
                      excludeIds={[resident.id, ...(existing ? [existing.id] : [])]}
                      // "On the barangay register" cannot offer somebody who
                      // lives outside it — the answer would contradict the
                      // question that was just asked.
                      residentsOnly
                    />
                  ) : (
                    <>
                      {/* Search before typing — see the block for a new child. */}
                      {!entries[0]?.typingOutsideParent ? (
                        <div>
                          <p className="mb-2 text-xs leading-relaxed text-gray-500">
                            Search the people already recorded from outside the barangay — a parent
                            named for an earlier child is already here.
                          </p>
                          <ResidentPicker
                            value={entries[0]?.otherParent ?? null}
                            onChange={(person) =>
                              updateEntry(0, {
                                otherParent: person,
                                outsideParentId: person?.id ?? null,
                              })
                            }
                            excludeIds={[resident.id, ...(existing ? [existing.id] : [])]}
                            nonResidentsOnly
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateEntry(0, {
                                typingOutsideParent: true,
                                otherParent: null,
                                outsideParentId: null,
                              })
                            }
                            className="mt-3 cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary"
                          >
                            Not there — type their details
                          </button>
                        </div>
                      ) : (
                      <>
                      <p className="mb-3 rounded-xl bg-secondary px-4 py-2.5 text-xs leading-relaxed text-gray-500">
                        Recorded as living <strong>outside the barangay</strong> — no portal
                        account, and not counted in the population. Just enough to reach them.
                      </p>
                      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                        <FormField label="First name" required>
                          <input
                            value={entries[0]?.outsideParent.first_name ?? ""}
                            onChange={(e) =>
                              updateEntry(0, {
                                outsideParent: {
                                  ...entries[0].outsideParent,
                                  first_name: e.target.value,
                                },
                                outsideParentId: null,
                              })
                            }
                            className={inputClasses}
                          />
                        </FormField>
                        <FormField label="Middle name">
                          <input
                            value={entries[0]?.outsideParent.middle_name ?? ""}
                            onChange={(e) =>
                              updateEntry(0, {
                                outsideParent: {
                                  ...entries[0].outsideParent,
                                  middle_name: e.target.value,
                                },
                                outsideParentId: null,
                              })
                            }
                            className={inputClasses}
                          />
                        </FormField>
                        <FormField label="Last name" required>
                          <input
                            value={entries[0]?.outsideParent.last_name ?? ""}
                            onChange={(e) =>
                              updateEntry(0, {
                                outsideParent: {
                                  ...entries[0].outsideParent,
                                  last_name: e.target.value,
                                },
                                outsideParentId: null,
                              })
                            }
                            className={inputClasses}
                          />
                        </FormField>
                        <FormField label="Phone number" hint="Philippine mobile — 10 digits after +63">
                          <PhoneInput
                            value={entries[0]?.outsideParent.contact_number ?? ""}
                            onChange={(v) =>
                              updateEntry(0, {
                                outsideParent: { ...entries[0].outsideParent, contact_number: v },
                                outsideParentId: null,
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Address" hint="Town or city is enough.">
                          <input
                            value={entries[0]?.outsideParent.address ?? ""}
                            onChange={(e) =>
                              updateEntry(0, {
                                outsideParent: {
                                  ...entries[0].outsideParent,
                                  address: e.target.value,
                                },
                                outsideParentId: null,
                              })
                            }
                            className={inputClasses}
                            placeholder="e.g. Villanueva, Misamis Oriental"
                          />
                        </FormField>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateEntry(0, { typingOutsideParent: false })}
                        className="mt-3 cursor-pointer text-xs font-semibold text-primary hover:underline"
                      >
                        Search the ones already recorded instead
                      </button>
                      </>
                      )}
                    </>
                  )}

                  {resident.spouse && entries[0]?.otherParent?.id !== resident.spouse.id && (
                    <button
                      type="button"
                      onClick={() =>
                        updateEntry(0, {
                          changingParent: false,
                          otherParentMode: "registry",
                          otherParent: resident.spouse as Resident,
                          outsideParentId: null,
                        })
                      }
                      className="mt-3 cursor-pointer text-xs font-semibold text-primary hover:underline"
                    >
                      Use {resident.spouse.first_name} {resident.spouse.last_name} instead
                    </button>
                  )}
                  </>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {mixedBatch && (
                <p className="rounded-xl bg-primary/10 px-4 py-2.5 text-xs leading-relaxed text-dark">
                  This batch mixes people who live <strong>in</strong> the barangay with people who
                  live <strong>outside</strong> it. That is fine — each is saved as what you marked
                  them, and only the residents are counted in the population.
                </p>
              )}

              {/* One block per person. */}
              {entries.map((entry, index) => (
                <div key={index} className="rounded-2xl border border-gray bg-secondary/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-dark">
                      {entries.length > 1 ? `${index + 1}. ` : ""}
                      {entry.form.first_name || entry.form.last_name
                        ? `${entry.form.first_name} ${entry.form.last_name}`.trim()
                        : `New ${copy.verb}`}
                      {entry.livesOutside === true && (
                        <span className="ml-2 rounded-full bg-gray px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Outside
                        </span>
                      )}
                      {entry.saved && (
                        <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                          Saved
                        </span>
                      )}
                    </p>
                    {entries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        aria-label={`Remove ${copy.verb} ${index + 1}`}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-gray bg-white px-3 py-1 text-xs font-semibold text-gray-500 transition-colors hover:border-danger hover:text-danger"
                      >
                        <FiX className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {relation !== "spouse" && (
                      <FormField label="Relationship" hint={copy.labelHint}>
                        <select
                          value={entry.label}
                          onChange={(e) => updateEntry(index, { label: e.target.value })}
                          className={inputClasses}
                        >
                          <option value="">Not specified</option>
                          {copy.labels.map((l) => (
                            <option key={l}>{l}</option>
                          ))}
                        </select>
                      </FormField>
                    )}

                    {/*
                      Which of them the barangay rings. Only worth asking once
                      there is more than one — a lone guardian is the contact
                      by definition.
                    */}
                    {relation === "guardian" && entries.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEntries((prev) =>
                            prev.map((e, i) => ({ ...e, isPrimary: i === index }))
                          )
                        }
                        aria-pressed={entry.isPrimary}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          entry.isPrimary
                            ? "border-primary bg-primary text-white"
                            : "border-gray bg-white text-dark hover:border-primary hover:text-primary"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            entry.isPrimary ? "border-white bg-white/20" : "border-gray"
                          }`}
                        >
                          {entry.isPrimary ? "✓" : ""}
                        </span>
                        This is the person the barangay contacts about {subjectName}
                      </button>
                    )}

                    {/*
                      Where THIS person lives — their own question, because a
                      batch can mix a child living at home with one who has
                      moved to the next town.
                    */}
                    <div className="space-y-4 rounded-xl border border-gray bg-white p-4">
                      <ChoiceGroup
                        label="Where does this person live?"
                        value={entry.livesOutside}
                        onChange={(value) => updateEntry(index, { livesOutside: value })}
                        options={[
                          {
                            value: false,
                            label: "In Barangay Natumolan",
                            hint: `Registered as a full resident record — the same information as Register Resident — and linked as ${subjectName}'s ${copy.verb}. Give an email address and their portal account is created and emailed to them.`,
                          },
                          {
                            value: true,
                            label: "Outside the barangay",
                            hint: "Recorded so the family is complete, but NOT as a barangay resident: no portal account, and not counted in the population. Only a name, a number and an address are needed. If they move here later the record can be converted, and the family links come with them.",
                          },
                        ]}
                      />

                      {entry.livesOutside === false && (
                        <div className="border-t border-gray pt-4">
                          <ChoiceGroup
                            label="Which household?"
                            value={entry.houseMode}
                            onChange={(value) => chooseHouseMode(index, value)}
                            options={[
                              { value: "same" as const, label: `Same as ${subjectName}` },
                              ...(relation === "child"
                                ? [
                                    {
                                      value: "guardian" as const,
                                      label: "With their guardian",
                                      hint: "For a child who does not live with this parent — left with a lola, a tita, a neighbour. The household is taken from that person, and they are recorded as the child's guardian in the same step.",
                                    },
                                  ]
                                : []),
                              { value: "other" as const, label: "A different household" },
                            ]}
                          />

                          {entry.houseMode === "" ? (
                            <p className="mt-3 text-xs text-warning">
                              Not answered yet — saved like this, they will have no household on
                              record.
                            </p>
                          ) : entry.houseMode === "same" ? (
                            <p className="mt-3 text-xs text-gray-500">
                              {subjectHousehold
                                ? `Household ${subjectHousehold.household_number}${
                                    subjectHousehold.street_address
                                      ? ` · ${subjectHousehold.street_address}`
                                      : ""
                                  }`
                                : `${subjectName} has no household on record, so none is assigned here either.`}
                            </p>
                          ) : entry.houseMode === "guardian" ? (
                            <div className="mt-3 space-y-3">
                              <ResidentPicker
                                value={entry.guardian}
                                onChange={(person) => chooseGuardian(index, person)}
                                excludeIds={[resident.id]}
                              />
                              {entry.guardian && (
                                <>
                                  <FormField
                                    label="How are they related to the child?"
                                    hint="Or that they are not related at all — whoever the child was left with."
                                  >
                                    <select
                                      value={entry.guardianRelation}
                                      onChange={(e) =>
                                        updateEntry(index, { guardianRelation: e.target.value })
                                      }
                                      className={inputClasses}
                                    >
                                      <option value="">Not specified</option>
                                      {COPY.guardian.labels.map((label) => (
                                        <option key={label}>{label}</option>
                                      ))}
                                    </select>
                                  </FormField>
                                  <p className="rounded-xl bg-secondary/70 px-4 py-2.5 text-xs leading-relaxed text-gray-600">
                                    The child is filed in{" "}
                                    <strong>{memberName(entry.guardian)}</strong>&rsquo;s household,
                                    and recorded as being in their care. {subjectName} stays the
                                    parent either way &mdash; a guardian is not a parent, and
                                    nothing on the family tree is derived from one.
                                  </p>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              <HouseholdPicker
                                value={entry.form.household_id}
                                selected={entry.household}
                                onSelect={(household) => selectHousehold(index, household)}
                                onAddNew={() => setHhForIndex(index)}
                                placeholder="Search their household, or register a new one…"
                              />
                              {entry.household && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => toggleOwner(index)}
                                    aria-pressed={entry.makeOwner}
                                    className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                                      entry.makeOwner
                                        ? "border-primary bg-primary text-white"
                                        : "border-gray bg-white text-dark hover:border-primary hover:text-primary"
                                    }`}
                                  >
                                    <span
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                                        entry.makeOwner ? "border-white bg-white/20" : "border-gray"
                                      }`}
                                    >
                                      {entry.makeOwner ? "✓" : ""}
                                    </span>
                                    Set{" "}
                                    {`${entry.form.first_name} ${entry.form.last_name}`.trim() ||
                                      "this person"}{" "}
                                    as that household&rsquo;s owner (head)
                                  </button>
                                  {entry.makeOwner && entry.household.head && (
                                    <span className="block text-xs text-warning">
                                      Replaces the current owner: {entry.household.head.first_name}{" "}
                                      {entry.household.head.last_name}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/*
                      THIS child's other parent. It sits in the child's own
                      block, not once at the top, because a batch may hold two
                      families — and when it was asked once, entering a second
                      child by a different mother meant closing the form and
                      starting again.
                    */}
                    {relation === "child" && entry.livesOutside !== null && (
                      <div className="rounded-xl border border-gray bg-white p-4">
                        <p className="mb-1 text-sm font-medium text-dark">
                          This child&rsquo;s other parent{" "}
                          <span className="font-normal text-gray-400">
                            &mdash; not the child
                          </span>
                        </p>
                        <p className="mb-3 text-xs leading-relaxed text-gray-400">
                          Optional. Named here, the child is recorded on BOTH parents at once, so
                          you never enter them twice.
                          {index > 0 && " Carried over from the child above — change it if this one has a different mother or father."}
                        </p>

                        {/*
                          Settled, until the clerk says otherwise.

                          For most children the answer is already right — the
                          partner on record, or the parent carried over from
                          the child above — so it is stated rather than asked.
                          Only a child by somebody else needs the question,
                          and that child gets a button.
                        */}
                        {settledParent(entry) && !entry.changingParent ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/70 px-4 py-3">
                            <p className="text-xs leading-relaxed text-dark">
                              <span className="font-semibold">{settledParent(entry)!.name}</span>
                              <span className="mx-2 text-gray-400">·</span>
                              <span className="text-gray-500">{settledParent(entry)!.note}</span>
                            </p>
                            <button
                              type="button"
                              onClick={() => updateEntry(index, { changingParent: true })}
                              className="shrink-0 cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary"
                            >
                              This one has a different parent
                            </button>
                          </div>
                        ) : (
                        <>
                        <div className="mb-3">
                          <ChoiceGroup
                            label="Is the other parent on the barangay register?"
                            value={entry.otherParentMode}
                            onChange={(value) =>
                              updateEntry(index, { otherParentMode: value, outsideParentId: null })
                            }
                            options={[
                              { value: "registry" as const, label: "Yes — find them" },
                              { value: "outside" as const, label: "No — record them here" },
                            ]}
                          />
                        </div>

                        {entry.otherParentMode === "registry" ? (
                          <ResidentPicker
                            value={entry.otherParent}
                            onChange={(person) => updateEntry(index, { otherParent: person })}
                            excludeIds={[resident.id]}
                            residentsOnly
                          />
                        ) : (
                          <>
                            {/*
                              Search before typing.

                              A mother working abroad is entered once and then
                              named again for every child she has by the same
                              man. Typing her each time makes a second record
                              of her, and the register then holds two women
                              who are the same person — with one child each.
                            */}
                            {!entry.typingOutsideParent ? (
                              <div>
                                <p className="mb-2 text-xs leading-relaxed text-gray-500">
                                  Search the people already recorded from outside the barangay — a
                                  parent named for an earlier child is already here.
                                </p>
                                <ResidentPicker
                                  value={entry.otherParent}
                                  onChange={(person) =>
                                    updateEntry(index, {
                                      otherParent: person,
                                      outsideParentId: person?.id ?? null,
                                    })
                                  }
                                  excludeIds={[resident.id]}
                                  nonResidentsOnly
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateEntry(index, {
                                      typingOutsideParent: true,
                                      otherParent: null,
                                      outsideParentId: null,
                                    })
                                  }
                                  className="mt-3 cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary"
                                >
                                  Not there — type their details
                                </button>
                              </div>
                            ) : (
                            <>
                            <p className="mb-3 rounded-xl bg-secondary px-4 py-2.5 text-xs leading-relaxed text-gray-500">
                              Recorded as living <strong>outside the barangay</strong> — no portal
                              account, and not counted in the population. Just enough to reach them.
                            </p>
                            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                              <FormField label="First name" required>
                                <input
                                  value={entry.outsideParent.first_name}
                                  onChange={(e) =>
                                    updateEntry(index, {
                                      outsideParent: { ...entry.outsideParent, first_name: e.target.value },
                                      outsideParentId: null,
                                    })
                                  }
                                  className={inputClasses}
                                />
                              </FormField>
                              <FormField label="Middle name">
                                <input
                                  value={entry.outsideParent.middle_name}
                                  onChange={(e) =>
                                    updateEntry(index, {
                                      outsideParent: { ...entry.outsideParent, middle_name: e.target.value },
                                      outsideParentId: null,
                                    })
                                  }
                                  className={inputClasses}
                                />
                              </FormField>
                              <FormField label="Last name" required>
                                <input
                                  value={entry.outsideParent.last_name}
                                  onChange={(e) =>
                                    updateEntry(index, {
                                      outsideParent: { ...entry.outsideParent, last_name: e.target.value },
                                      outsideParentId: null,
                                    })
                                  }
                                  className={inputClasses}
                                />
                              </FormField>
                              <FormField label="Phone number" hint="Philippine mobile — 10 digits after +63">
                                <PhoneInput
                                  value={entry.outsideParent.contact_number}
                                  onChange={(v) =>
                                    updateEntry(index, {
                                      outsideParent: { ...entry.outsideParent, contact_number: v },
                                    })
                                  }
                                />
                              </FormField>
                              <FormField label="Address" hint="Town or city is enough.">
                                <input
                                  value={entry.outsideParent.address}
                                  onChange={(e) =>
                                    updateEntry(index, {
                                      outsideParent: { ...entry.outsideParent, address: e.target.value },
                                    })
                                  }
                                  className={inputClasses}
                                  placeholder="e.g. Villanueva, Misamis Oriental"
                                />
                              </FormField>
                            </div>

                            <button
                              type="button"
                              onClick={() => updateEntry(index, { typingOutsideParent: false })}
                              className="mt-3 cursor-pointer text-xs font-semibold text-primary hover:underline"
                            >
                              Search the ones already recorded instead
                            </button>
                            </>
                            )}
                          </>
                        )}

                        {/*
                          The way back. Having opened the question, the clerk
                          must be able to undo that without retyping the
                          partner they already had.
                        */}
                        {resident.spouse && entry.otherParent?.id !== resident.spouse.id && (
                          <button
                            type="button"
                            onClick={() =>
                              updateEntry(index, {
                                changingParent: false,
                                otherParentMode: "registry",
                                otherParent: resident.spouse as Resident,
                                outsideParentId: null,
                              })
                            }
                            className="mt-3 cursor-pointer text-xs font-semibold text-primary hover:underline"
                          >
                            Use {resident.spouse.first_name} {resident.spouse.last_name} instead
                          </button>
                        )}
                        </>
                        )}

                        {/*
                          Who is the mother and who is the father, spelled out.
                          "The other parent" on its own tells the clerk nothing,
                          and the surname choices cannot be offered without it.
                        */}
                        {(() => {
                          const { other, derived, side, mother, father } = parentsOf(entry);
                          if (!other) return null;

                          return (
                            <div className="mt-3 rounded-xl bg-secondary/70 px-4 py-3">
                              {side ? (
                                <p className="text-xs leading-relaxed text-dark">
                                  Mother: <strong>{nameOf(mother)}</strong>
                                  <span className="mx-2 text-gray-400">·</span>
                                  Father: <strong>{nameOf(father)}</strong>
                                  {!derived && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateEntry(index, {
                                          motherIs: side === "subject" ? "other" : "subject",
                                        })
                                      }
                                      className="ml-2 cursor-pointer text-xs font-semibold text-primary hover:underline"
                                    >
                                      swap
                                    </button>
                                  )}
                                </p>
                              ) : (
                                <>
                                  <p className="mb-2 text-xs font-medium text-dark">
                                    Which of them is the mother?
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {(
                                      [
                                        ["subject", nameOf(resident)],
                                        ["other", nameOf(other)],
                                      ] as const
                                    ).map(([value, text]) => (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => updateEntry(index, { motherIs: value })}
                                        className="cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                                      >
                                        {text || "(unnamed)"}
                                      </button>
                                    ))}
                                  </div>
                                  <p className="mt-2 text-xs text-gray-400">
                                    Needed for the surname choices below — a parent recorded from
                                    outside the barangay has a name and a number, not a sex.
                                  </p>
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {/*
                      How this child's name is composed. Unmarried parents have
                      a real choice here, and typing it by hand each time is how
                      a middle name ends up wrong.
                    */}
                    {canNamePattern(entry) && entry.livesOutside !== null && (
                      <div className="rounded-xl border border-gray bg-white p-3">
                        <p className="mb-2 text-xs font-medium text-dark">
                          How is this child&rsquo;s name recorded?
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applyNamePattern(index, "father")}
                            className="cursor-pointer rounded-full border border-gray px-3.5 py-1.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                          >
                            {surnameOf(parentsOf(entry).father)} — with{" "}
                            {surnameOf(parentsOf(entry).mother)} as middle name
                          </button>
                          <button
                            type="button"
                            onClick={() => applyNamePattern(index, "mother")}
                            className="cursor-pointer rounded-full border border-gray px-3.5 py-1.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                          >
                            {surnameOf(parentsOf(entry).mother)} only (mother&rsquo;s)
                          </button>
                          <button
                            type="button"
                            onClick={() => applyNamePattern(index, "father-only")}
                            className="cursor-pointer rounded-full border border-gray px-3.5 py-1.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                          >
                            {surnameOf(parentsOf(entry).father)} only (father&rsquo;s)
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-gray-400">
                          A child of unmarried parents carries the mother&rsquo;s surname by
                          default; the father&rsquo;s may be used when he has acknowledged the child
                          (RA 9255), with the mother&rsquo;s surname as the middle name.
                        </p>
                      </div>
                    )}

                    <p className="mb-2 mt-4 border-t border-gray pt-4 text-sm font-medium text-dark">
                      {copy.verb === "child"
                        ? "This child’s own details"
                        : `This ${copy.verb}’s own details`}
                    </p>

                    {entry.livesOutside === null ? (
                      /*
                        No fields until the question above is answered. Which
                        fields there are IS the answer to it: a full resident
                        record, or the five lines kept for someone who lives
                        elsewhere. Showing one of them first would be picking
                        for the clerk.
                      */
                      <p className="rounded-xl border border-dashed border-gray bg-white px-4 py-3 text-xs leading-relaxed text-gray-500">
                        Answer <strong className="text-dark">Where does this person live?</strong>{" "}
                        above and their form appears here.
                      </p>
                    ) : entry.livesOutside ? (
                      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                        <FormField label="First name" required>
                          <input
                            value={entry.form.first_name}
                            onChange={(e) => patchForm(index, { first_name: e.target.value })}
                            required
                            className={inputClasses}
                          />
                        </FormField>
                        <FormField label="Middle name">
                          <input
                            value={entry.form.middle_name}
                            onChange={(e) => patchForm(index, { middle_name: e.target.value })}
                            className={inputClasses}
                          />
                        </FormField>
                        <FormField label="Last name" required>
                          <input
                            value={entry.form.last_name}
                            onChange={(e) => patchForm(index, { last_name: e.target.value })}
                            required
                            className={inputClasses}
                          />
                        </FormField>
                        <FormField label="Suffix">
                          <input
                            value={entry.form.suffix}
                            onChange={(e) => patchForm(index, { suffix: e.target.value })}
                            className={inputClasses}
                            placeholder="Jr., Sr., III"
                          />
                        </FormField>
                        <FormField label="Phone number" hint="Philippine mobile — 10 digits after +63">
                          <PhoneInput
                            value={entry.form.contact_number}
                            onChange={(v) => patchForm(index, { contact_number: v })}
                          />
                        </FormField>
                        <FormField label="Address" hint="Where they live — town or city is enough.">
                          <input
                            value={entry.form.address}
                            onChange={(e) => patchForm(index, { address: e.target.value })}
                            className={inputClasses}
                            placeholder="e.g. Villanueva, Misamis Oriental"
                          />
                        </FormField>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                        <ResidentFormFields
                          form={entry.form}
                          onChange={(values) => patchForm(index, values)}
                          manualSectors={entry.manualSectors}
                          onToggleSector={(sector) =>
                            updateEntry(index, {
                              manualSectors: entry.manualSectors.includes(sector)
                                ? entry.manualSectors.filter((s) => s !== sector)
                                : [...entry.manualSectors, sector],
                            })
                          }
                          autoLength={entry.autoLength}
                          onAutoLengthChange={(value) => updateEntry(index, { autoLength: value })}
                          selectedHousehold={entry.household}
                          onSelectHousehold={(household) => selectHousehold(index, household)}
                          // Both are asked above, in this person's own block.
                          showHousehold={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* One press, one more block — no saving in between. */}
              {canAddMore && (
                <button
                  type="button"
                  onClick={addEntry}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray py-3 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <FiPlus className="h-4 w-4" aria-hidden="true" />
                  Add another {copy.verb}
                </button>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={saving || (mode === "existing" && !existing)}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : mode === "existing"
                ? `Link as ${copy.verb}`
                : entries.length > 1
                  ? `Register & link all ${entries.length} ${copy.plural}`
                  : `Register & link as ${copy.verb}`}
          </button>
        </form>
      </Modal>

      <NewHouseholdModal
        open={hhForIndex !== null}
        onClose={() => setHhForIndex(null)}
        onCreated={(household) => {
          if (hhForIndex === null) return;
          selectHousehold(hhForIndex, household);
          // A brand-new household has no owner yet, and the person being
          // added is almost always the reason it was created.
          updateEntry(hhForIndex, { houseMode: "other", makeOwner: true });
        }}
        defaultPurok={hhForIndex !== null ? entries[hhForIndex]?.form.zone_purok : undefined}
      />

      <NamesakeCheck
        namesakes={namesakes}
        firstName={pendingForm.first_name}
        lastName={pendingForm.last_name}
        birthdate={pendingForm.birthdate}
        zonePurok={pendingForm.zone_purok}
        saving={saving}
        onCancel={() => setNamesakes(null)}
        onConfirm={() => {
          setNamesakes(null);
          // Resume at the block that was queried, so the ones already saved
          // are not entered a second time.
          saveFrom(pendingIndex, pendingIndex);
        }}
        renderLink={(n) => (
          <Link
            to={`/residents/${n.id}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Open
          </Link>
        )}
      />
    </>
  );
}
