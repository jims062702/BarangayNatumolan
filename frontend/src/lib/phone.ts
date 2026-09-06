/**
 * One shape for a Philippine mobile number.
 *
 * The register holds them three ways, because three people typed them:
 * `09171234567`, `+639171234567`, and a bare `9171234567`. They are the same
 * phone. A clerk searching for one of them finds only the third of the
 * register that happens to be written their way, and a form that reads them
 * differently from the way it writes them loses a digit every round trip.
 */

/**
 * The ten digits after +63, whatever arrived.
 *
 * The leading zero matters: `09171234567` is eleven digits, and taking the
 * first ten of it gives `0917123456` — a truncated number that looks
 * complete. That is what the old picker did.
 */
export function localMobile(stored: unknown): string {
  const only = String(stored ?? "").replace(/\D/g, "");

  return only.replace(/^63/, "").replace(/^0/, "").slice(0, 10);
}

/** Back to the one shape the register stores. An empty box stays empty. */
export function e164Mobile(typed: unknown): string {
  const ten = localMobile(typed);

  return ten === "" ? "" : `+63${ten}`;
}
