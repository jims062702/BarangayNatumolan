/**
 * Notification sounds, synthesised with the Web Audio API — no audio files to
 * bundle, works fully offline. A soft two-note bell for staff notifications
 * and a gentler pop for incoming chatbot messages (Messenger-style).
 *
 * Respects a persisted mute preference (shared by the bell and the chatbot).
 */
const MUTE_KEY = "bn-sound-muted";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// Browsers start the AudioContext suspended until the user interacts with the
// page. Resume it on the first gesture so a later poll-triggered sound (which
// has no gesture of its own) can still play.
if (typeof window !== "undefined" && !(window as unknown as { __bnSoundInit?: boolean }).__bnSoundInit) {
  (window as unknown as { __bnSoundInit?: boolean }).__bnSoundInit = true;
  const resume = () => {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);
}

// --- Mute preference (with a tiny pub/sub so both toggles stay in sync) ---
type MuteListener = (muted: boolean) => void;
const muteListeners = new Set<MuteListener>();

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage unavailable — mute is best-effort.
  }
  muteListeners.forEach((listener) => listener(muted));
}

export function subscribeSoundMuted(listener: MuteListener): () => void {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

interface Tone {
  freq: number;
  /** Seconds after the sound starts. */
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function playTones(tones: Tone[]): void {
  if (isSoundMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const now = c.currentTime;
  for (const tone of tones) {
    const osc = c.createOscillator();
    const gainNode = c.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.value = tone.freq;

    const startAt = now + tone.start;
    const peak = tone.gain ?? 0.15;
    // Quick attack, exponential decay — a soft chime rather than a beep.
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.duration);

    osc.connect(gainNode).connect(c.destination);
    osc.start(startAt);
    osc.stop(startAt + tone.duration + 0.03);
  }
}

/**
 * Bright three-note rising chime for a new staff/resident notification.
 * Loud and higher-pitched so it cuts through — repeated once for attention.
 */
export function playNotificationSound(): void {
  playTones([
    { freq: 988, start: 0, duration: 0.22, gain: 0.6 }, // B5
    { freq: 1319, start: 0.13, duration: 0.22, gain: 0.6 }, // E6
    { freq: 1760, start: 0.26, duration: 0.4, gain: 0.6 }, // A6
    // Quick echo of the top note so it reads as an alert, not a single blip.
    { freq: 1760, start: 0.62, duration: 0.4, gain: 0.5 },
  ]);
}

/** Rising pop for an incoming chatbot message — clearly audible. */
export function playChatSound(): void {
  playTones([
    { freq: 660, start: 0, duration: 0.14, gain: 0.4 }, // E5
    { freq: 988, start: 0.07, duration: 0.2, gain: 0.38 }, // B5
  ]);
}
