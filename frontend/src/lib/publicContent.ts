/**
 * Tiny sessionStorage cache for public landing content (hero pictures,
 * news, officials). Lets repeat visits render the SK-managed content
 * instantly while a background fetch refreshes it — no flash, no wait.
 */
const PREFIX = "bn-public:";

export function readPublicCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writePublicCache(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — caching is best-effort only.
  }
}
