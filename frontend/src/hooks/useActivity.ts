/**
 * When the person at the keyboard last did something.
 *
 * Not "when the app last spoke to the server" — those stopped being the same
 * thing the moment a background poll started running once a second. A tab
 * left open on a counter is busy by that measure and idle by every measure
 * that matters.
 *
 * Kept outside React and shared across tabs through localStorage, because a
 * clerk with the register open in one tab and a form in another is one person
 * having one afternoon, and signing them out of the form while they type in
 * the register would be absurd.
 */

const KEY = "lastActivityAt";

/* Movement is the noisiest of these by far, so it is sampled rather than
   recorded: writing to localStorage on every mousemove is a write per frame. */
const WRITE_EVERY_MS = 5000;

let lastWrite = 0;
let started = false;

function note() {
  const now = Date.now();

  if (now - lastWrite < WRITE_EVERY_MS) return;

  lastWrite = now;

  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    /* A browser with site data blocked. The in-memory clock below still
       works for this tab, which is the case that matters most. */
  }
}

/** Real intent, not the app talking to itself. */
const EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "wheel", "focus"] as const;

export function watchActivity() {
  if (started) return;

  started = true;
  note();

  EVENTS.forEach((event) =>
    window.addEventListener(event, note, { passive: true, capture: true }),
  );
}

/** Milliseconds since the person last did something, in ANY tab. */
export function idleFor(): number {
  let stored = 0;

  try {
    stored = Number(localStorage.getItem(KEY) ?? 0);
  } catch {
    stored = 0;
  }

  /*
   * The later of the two clocks.
   *
   * `lastWrite` is this tab; the stored value may be a sibling tab that is
   * being used right now. Taking the maximum is what makes two tabs behave
   * like one session.
   */
  const seen = Math.max(stored, lastWrite);

  return seen === 0 ? 0 : Date.now() - seen;
}

/** Marks the person as active — for a "stay signed in" button to call. */
export function markActive() {
  lastWrite = 0;
  note();
}
