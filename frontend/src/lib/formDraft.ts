/**
 * Drafts for long forms, kept in the browser.
 *
 * The family forms take minutes to fill in — several people, each with a full
 * resident record — and the dialog closes on a stray click outside it, with
 * nothing asked first. Losing all of that to one misplaced click is the kind
 * of thing that makes a clerk stop using a feature, so what has been typed is
 * written down as it is typed and offered back when the form is next opened.
 *
 * A draft survives a closed dialog, a reload and a closed browser. It does NOT
 * survive logging out: it holds residents' names, birthdates and phone
 * numbers, and the next person at that desk has no business seeing them.
 */

const PREFIX = "bn-draft:";

interface Envelope<T> {
  saved_at: number;
  value: T;
}

/** Writes a draft. Storage being unavailable is not worth an interruption. */
export function saveDraft<T>(key: string, value: T): void {
  try {
    const envelope: Envelope<T> = { saved_at: Date.now(), value };
    localStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Private mode, or the quota is full. The form still works; only the
    // safety net is missing, and saying so mid-sentence would help nobody.
  }
}

/** The draft stored under `key`, or null when there is none to be had. */
export function loadDraft<T>(key: string): { value: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;

    const envelope = JSON.parse(raw) as Envelope<T>;
    if (!envelope || typeof envelope !== "object" || envelope.value == null) return null;

    return { value: envelope.value, savedAt: envelope.saved_at ?? 0 };
  } catch {
    // Corrupt, or written by an older shape of the form. Start clean rather
    // than restoring something that would half-fill the fields.
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to clear.
  }
}

/** Drops every draft on this machine — see the note at the top. */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing to clear.
  }
}

/** How long ago a draft was written, in words, for the notice on the form. */
export function draftAge(savedAt: number): string {
  const minutes = Math.floor((Date.now() - savedAt) / 60000);
  if (minutes < 1) return "a moment ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
