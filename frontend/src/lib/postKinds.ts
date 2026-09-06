/**
 * The five kinds of post, named once.
 *
 * A barangay does not publish "news". It publishes five different things, and
 * a resident wants them for five different reasons — so the badge, the colour
 * and the wording live here rather than being retyped on the public page, the
 * detail page, the portal and the staff form, where they would drift apart
 * within a month.
 *
 * The distinction that does the most work is Event against Activity: the same
 * medical mission is an Event before it happens and an Activity after, and
 * only one of the two belongs on a resident's calendar.
 */

export type PostKind = "Announcement" | "Event" | "Activity" | "Advisory" | "Program";

export const POST_KINDS: PostKind[] = [
  "Announcement",
  "Event",
  "Activity",
  "Advisory",
  "Program",
];

interface KindMeta {
  /** What the chip on the public page says — plural, because it filters. */
  plural: string;
  /** What the badge on a card says. */
  badge: string;
  /** One line for the staff form, so the kind is chosen on purpose. */
  purpose: string;
  /** Badge colours. Never the only signal: the badge always carries words. */
  tone: string;
  /** The colour of the card's own accent — a rule, a ring. */
  accent: string;
}

export const KIND: Record<PostKind, KindMeta> = {
  Announcement: {
    plural: "Announcements",
    badge: "Announcement",
    purpose: "Something residents need to know — office hours, a new policy, a schedule.",
    tone: "bg-primary/10 text-primary",
    accent: "border-primary/30",
  },
  Event: {
    plural: "Events",
    /* Plain "Event" — badgeFor() adds "Upcoming" only when it still is. */
    badge: "Event",
    purpose: "Something coming up that residents can join. Give the date, time and venue.",
    tone: "bg-teal-50 text-teal-700",
    accent: "border-teal-200",
  },
  Activity: {
    plural: "Activities",
    badge: "Activity",
    purpose: "Something the barangay has already done — a recap, with the date it happened.",
    tone: "bg-secondary text-gray-600",
    accent: "border-gray",
  },
  Advisory: {
    plural: "Advisories",
    badge: "Advisory",
    purpose: "Something urgent. Give when it starts and when it ends, or it never looks over.",
    tone: "bg-danger/10 text-danger",
    accent: "border-danger/40",
  },
  Program: {
    plural: "Programs",
    badge: "Program",
    purpose: "A service residents can come and claim — a mission, a training, an assistance.",
    tone: "bg-warning/15 text-amber-700",
    accent: "border-warning/40",
  },
};

/**
 * Today, as the plain YYYY-MM-DD the dates are stored in.
 *
 * Compared as strings rather than as Date objects on purpose: an event date
 * has no time and no timezone, and `new Date("2026-07-13")` is parsed as
 * midnight UTC — which is the 12th of July for anybody reading in Manila.
 */
function todayISO(): string {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Still to come, counting the whole of the day it falls on. */
export function isUpcoming(date?: string | null): boolean {
  return Boolean(date) && String(date).slice(0, 10) >= todayISO();
}

/**
 * What the badge says.
 *
 * An Event whose date has gone by is still an Event — it is not upcoming, and
 * a card that keeps saying UPCOMING EVENT over a date two months old is the
 * page telling a resident something it can plainly see is untrue. The office
 * can re-file it as an Activity; until they do, the badge is honest.
 */
export function badgeFor(post: { category?: string | null; event_at?: string | null }): string {
  const kind = kindOf(post.category);

  if (kind !== "Event") return KIND[kind].badge;

  return isUpcoming(post.event_at) ? "Upcoming Event" : "Event";
}

/** An unknown kind from an older row must not crash a page. */
export function kindOf(value: unknown): PostKind {
  return POST_KINDS.includes(value as PostKind) ? (value as PostKind) : "Announcement";
}

/**
 * Which fields each kind carries. Mirrors Announcement::FIELDS on the server,
 * which is the side that enforces it.
 */
export const KIND_FIELDS: Record<PostKind, string[]> = {
  Announcement: [],
  Event: ["event_at", "event_time", "location", "organizer", "contact_info", "registration_deadline"],
  Activity: ["completed_at", "location", "participants"],
  Advisory: ["effective_at", "expires_at", "urgency"],
  Program: ["location", "contact_info", "registration_deadline"],
};

export const URGENCIES = ["Low", "Medium", "High", "Critical"] as const;

/** How loudly an advisory is drawn. Colour plus the word, never colour alone. */
export const URGENCY_TONE: Record<string, string> = {
  Low: "bg-secondary text-gray-600",
  Medium: "bg-warning/15 text-amber-700",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-danger/15 text-danger",
};

/**
 * A date the way a barangay notice writes it.
 *
 * Read from the stored string rather than through `new Date(...)` where only
 * the day matters: parsing a UTC timestamp and formatting it back in local
 * time moves an early-morning event to the day before.
 */
export function postDate(value?: string | null): string {
  if (!value) return "";

  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";

  return new Date(y, m - 1, d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** The line a card leads with: the date that matters for THAT kind. */
export function whenOf(post: {
  category?: string;
  event_at?: string | null;
  completed_at?: string | null;
  effective_at?: string | null;
  published_at?: string | null;
}): string {
  switch (kindOf(post.category)) {
    case "Event":
      return postDate(post.event_at) || postDate(post.published_at);
    case "Activity":
      return postDate(post.completed_at) || postDate(post.published_at);
    case "Advisory":
      return postDate(post.effective_at) || postDate(post.published_at);
    default:
      return postDate(post.published_at);
  }
}
