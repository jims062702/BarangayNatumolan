import { Link } from "react-router-dom";
import { FiHeart, FiHome, FiUser, FiUsers } from "react-icons/fi";
import Card from "./UI/Card";
import type { Family, FamilyMember } from "../types";

/** Everything that can be added from this panel. */
export type FamilyRelation = "parent" | "child" | "spouse" | "guardian";

/** "January 2019" — a care arrangement is remembered by month, not by day. */
function monthYear(date?: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * A resident's family, as one panel.
 *
 * Shown to the Population Office on a profile and to the resident themselves
 * in the portal, which is why it takes plain data and a `linkTo` rather than
 * assuming a route: a resident may see who their lola is, but not open her
 * registry record.
 */

/** Whole-year age, so a card can say "Miguel · 4 yrs" without a round trip. */
function ageOf(member: FamilyMember): number | null {
  if (member.age != null) return member.age;
  if (!member.birthdate) return null;
  const b = new Date(member.birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

export function memberName(member: FamilyMember): string {
  if (member.full_name) return member.full_name;
  return [member.first_name, member.middle_name, member.last_name, member.suffix]
    .filter(Boolean)
    .join(" ");
}

function MemberCard({
  member,
  linkTo,
  onRemove,
  onEnd,
}: {
  member: FamilyMember;
  linkTo?: (member: FamilyMember) => string | null;
  onRemove?: (member: FamilyMember) => void;
  /** Guardians only: the arrangement came to an end, rather than being wrong. */
  onEnd?: (member: FamilyMember) => void;
}) {
  const age = ageOf(member);
  const care = member.guardianship ?? null;
  const since = monthYear(care?.started_on);
  const label = member.relationship ?? member.pivot?.relationship ?? null;
  const href = linkTo?.(member) ?? null;

  // Someone who lives outside the barangay is shown as such: their card has
  // no purok or age to show, and the office needs to know at a glance that
  // they have no portal account and are not in the population count.
  const outside = member.record_type === "Non-resident";
  // A parent who has died stays on the card — they are still the parent —
  // but the reader should not have to guess why there is no age beside them.
  const late = member.life_status === "Deceased";

  const body = (
    <>
      <span className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-dark">{memberName(member)}</span>
        {outside && (
          <span className="shrink-0 rounded-full bg-gray px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Outside
          </span>
        )}
        {late && (
          <span className="shrink-0 rounded-full bg-dark/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-dark">
            Deceased
          </span>
        )}
        {/*
          A child left with a couple has two guardians and one of them is the
          one who answers. Saying which is the difference between reaching
          somebody and leaving a message with whoever is in the house.
        */}
        {care?.is_primary && (
          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            Contact
          </span>
        )}
      </span>
      <span className="block text-xs text-gray-500">
        {(outside
          ? [label, member.address, member.contact_number]
          : [label, member.gender, age != null ? `${age} yrs` : null, member.zone_purok]
        )
          .filter(Boolean)
          .join(" · ") || "—"}
      </span>
      {(care?.reason || since) && (
        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-400">
          {[care?.reason, since ? `since ${since}` : null].filter(Boolean).join(" · ")}
        </span>
      )}
    </>
  );

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-gray/70 px-3.5 py-2.5">
      <div className="min-w-0">
        {href ? (
          <Link to={href} className="block min-w-0 hover:underline">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1.5">
        {/*
          Two different things, kept apart on purpose. An arrangement that
          ENDED is history worth keeping — who was raising this child in 2026
          is asked years later. One recorded against the wrong person is not
          history, it is a mistake, and it goes.
        */}
        {onEnd && (
          <button
            type="button"
            onClick={() => onEnd(member)}
            className="cursor-pointer rounded-full border border-gray px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-primary hover:text-primary"
            title="This arrangement has ended — keep it on the record"
          >
            End
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(member)}
            className="cursor-pointer rounded-full border border-gray px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-danger hover:text-danger"
            title="Remove this link — it was recorded in error"
          >
            Unlink
          </button>
        )}
      </span>
    </div>
  );
}

function Group({
  title,
  hint,
  members,
  linkTo,
  onRemove,
  onEnd,
  action,
  empty,
}: {
  title: string;
  hint?: string;
  members: FamilyMember[];
  linkTo?: (member: FamilyMember) => string | null;
  onRemove?: (member: FamilyMember) => void;
  onEnd?: (member: FamilyMember) => void;
  action?: React.ReactNode;
  empty: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
        </div>
        {action}
      </div>
      {members.length === 0 ? (
        <p className="rounded-xl bg-secondary/60 px-3.5 py-2.5 text-xs text-gray-400">{empty}</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              linkTo={linkTo}
              onRemove={onRemove}
              onEnd={onEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  family: Family;
  /** Where a member's name links to, or null for a name with no link. */
  linkTo?: (member: FamilyMember) => string | null;
  /** Present only for the office: opens the Add parent/child/spouse form. */
  onAdd?: (relation: FamilyRelation) => void;
  onRemove?: (member: FamilyMember, relation: FamilyRelation) => void;
  /** Ends a guardianship that ran its course, keeping it on the record. */
  onEndGuardianship?: (member: FamilyMember) => void;
  title?: string;
}

export default function FamilyPanel({
  family,
  linkTo,
  onAdd,
  onRemove,
  onEndGuardianship,
  title = "Family",
}: Props) {
  const addButton = (relation: FamilyRelation, label: string) =>
    onAdd ? (
      <button
        type="button"
        onClick={() => onAdd(relation)}
        className="cursor-pointer text-xs font-semibold text-primary hover:underline"
      >
        + {label}
      </button>
    ) : undefined;

  const spouse = family.spouse ?? null;
  const guardians = family.guardians ?? [];
  const wards = family.wards ?? [];
  const pastGuardians = family.past_guardians ?? [];
  const careNote = family.care_note ?? null;

  return (
    <Card title={title}>
      {/*
        The sentence that turns a gap into something a clerk can act on. A
        child registered here whose mother and father are both recorded
        abroad has a profile that LOOKS complete — parents named, household
        set — while the one thing the barangay needs, who to knock for, is
        nowhere on it. So the record says so itself.
      */}
      {careNote && (
        <p
          className={`mb-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm leading-relaxed ${
            careNote.kind === "missing"
              ? "bg-warning/10 text-dark"
              : "bg-secondary/70 text-gray-600"
          }`}
        >
          <FiHome aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{careNote.text}</span>
        </p>
      )}
      {/*
        Shown only where the family agreed the children may see it — the
        reason is always on the parents' own records either way.
      */}
      {family.parents_note && (
        <p className="mb-4 rounded-xl bg-secondary/70 px-4 py-3 text-sm leading-relaxed text-gray-600">
          The parents&rsquo; marriage ended
          {family.parents_note.ended_on
            ? ` in ${new Date(family.parents_note.ended_on).getFullYear()}`
            : ""}
          {family.parents_note.end_reason
            ? ` — ${family.parents_note.end_reason.toLowerCase()}`
            : ""}
          {family.parents_note.deceased_name
            ? ` (${family.parents_note.deceased_name} passed away)`
            : ""}
          .
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Group
          title="Parents"
          members={family.parents ?? []}
          linkTo={linkTo}
          onRemove={onRemove ? (m) => onRemove(m, "parent") : undefined}
          action={addButton("parent", "Add parent")}
          empty="No parents recorded yet."
        />

        {/*
          Care, not descent. It sits beside the parents because that is the
          question a reader is asking at that moment — and it is deliberately
          NOT part of the tree: a lola recorded as a parent would turn her own
          children into this child's brothers and sisters.
        */}
        {/*
          Shown to the office always, so the gap is visible; shown to a
          resident only when there IS one. "Nobody recorded" is an instruction
          to a clerk, and an adult reading their own profile does not need to
          be told they have no guardian.
        */}
        {(guardians.length > 0 || onAdd) && (
          <Group
            title="Guardian / carer"
            hint="Who the child actually lives with. Not a parent link — nothing is derived from it."
            members={guardians}
            linkTo={linkTo}
            onRemove={onRemove ? (m) => onRemove(m, "guardian") : undefined}
            onEnd={onEndGuardianship}
            action={addButton("guardian", "Add guardian")}
            empty="Nobody recorded — add one if the child is not living with their parents."
          />
        )}

        {/*
          The other direction: children THIS person is raising. A lola with
          three grandchildren in her care is answering a different question
          from "who raises her", and both belong on her profile.
        */}
        {wards.length > 0 && (
          <Group
            title="In their care"
            hint="Children this resident is raising. Not their own children — care, not descent."
            members={wards}
            linkTo={linkTo}
            empty="Nobody."
          />
        )}

        {/*
          Arrangements that came to an end.

          Kept visible because a child's care history is exactly what gets
          asked about years later — who had them, from when, and why it
          stopped. Not a Group: these carry dates and an end reason, and no
          longer point at a live link to open.
        */}
        {pastGuardians.length > 0 && (
          <div className="md:col-span-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Past care arrangements
            </p>
            <p className="mb-3 text-xs leading-relaxed text-gray-400">
              Ended, and kept on the record — a child&rsquo;s care history is what gets asked
              about later.
            </p>
            <div className="space-y-2">
              {pastGuardians.map((past) => (
                <div
                  key={past.id}
                  className="rounded-xl border border-gray bg-secondary/40 px-4 py-3 text-xs"
                >
                  <p className="font-semibold text-dark">
                    {past.name ?? "Unnamed"}
                    {past.relation ? <span className="font-normal text-gray-500"> · {past.relation}</span> : null}
                  </p>
                  <p className="mt-0.5 text-gray-500">
                    {past.started_on ? new Date(past.started_on).toLocaleDateString("en-PH") : "—"}
                    {" to "}
                    {past.ended_on ? new Date(past.ended_on).toLocaleDateString("en-PH") : "—"}
                    {past.end_reason ? ` · ${past.end_reason}` : ""}
                  </p>
                  {past.reason && <p className="mt-0.5 text-gray-400">Why: {past.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/*
          The button stays put whether or not there is a spouse. Hiding it once
          one is recorded meant a clerk looking for "where do I change this?"
          found nothing at all — and a remarriage is exactly when they go
          looking. Pressing it with a union still open explains what has to
          happen first rather than pretending the option is not there.
        */}
        <Group
          title="Spouse / Partner"
          members={spouse ? [spouse] : []}
          linkTo={linkTo}
          onRemove={onRemove ? (m) => onRemove(m, "spouse") : undefined}
          action={addButton(
            "spouse",
            spouse ? "Add a new spouse or partner" : "Add a spouse or partner"
          )}
          empty="No spouse or partner recorded."
        />

        <Group
          title="Children"
          hint={
            spouse
              ? `A child added here is also recorded as ${memberName(spouse)}'s.`
              : "Name the other parent on the form and the child is recorded on both at once."
          }
          members={family.children ?? []}
          linkTo={linkTo}
          onRemove={onRemove ? (m) => onRemove(m, "child") : undefined}
          action={addButton("child", "Add child")}
          empty="No children recorded yet."
        />

        <Group
          title="Grandparents (lola / lolo)"
          hint="Worked out from the parents' own parents."
          members={family.grandparents ?? []}
          linkTo={linkTo}
          empty="None on record — add the parents' parents to see them here."
        />

        {/*
          Sideways relatives. All three are read back off the same parent/child
          links — nobody types them in — so they only appear once there is
          something to derive them from, rather than sitting empty and
          implying the clerk forgot to fill something in.
        */}
        {/*
          A remarriage, shown as one. These sit apart from Parents and
          Children because that is what they are — and because the register
          derives nothing through them: a step-mother's own parents are not
          this child's grandparents, and her children are not their siblings.
        */}
        {(family.siblings?.length ?? 0) > 0 && (
          <div className="md:col-span-2">
            <Group
              title="Siblings (kapatid)"
              hint="Everyone who shares a parent by blood. Half-brothers and half-sisters are named as such."
              members={family.siblings ?? []}
              linkTo={linkTo}
              empty="No siblings recorded."
            />
          </div>
        )}

        {(family.aunts_uncles?.length ?? 0) > 0 && (
          <Group
            title="Aunts & uncles (tita / tito)"
            hint="The siblings of this person's parents."
            members={family.aunts_uncles ?? []}
            linkTo={linkTo}
            empty="None on record."
          />
        )}

        {(family.cousins?.length ?? 0) > 0 && (
          <Group
            title="Cousins (pinsan)"
            hint="The children of those aunts and uncles."
            members={family.cousins ?? []}
            linkTo={linkTo}
            empty="None on record."
          />
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 px-4 py-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <FiUser aria-hidden="true" /> Parents &amp; children are full resident records.
        </span>
        <span className="flex items-center gap-1.5">
          <FiHeart aria-hidden="true" /> Marriage links both people at once.
        </span>
        <span className="flex items-center gap-1.5">
          <FiUsers aria-hidden="true" /> Grandparents, siblings, tita/tito and pinsan are worked out,
          never typed in.
        </span>
        <span className="flex items-center gap-1.5">
          <FiHome aria-hidden="true" /> A guardian is who the child lives with &mdash; it changes
          nothing on the family tree.
        </span>
      </div>
    </Card>
  );
}
