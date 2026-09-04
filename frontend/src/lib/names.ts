/**
 * How a person's name is written out.
 *
 * The register holds the parts; every place that shows a whole name has to
 * put them together the same way, or the same person reads differently on
 * two screens.
 */

/**
 * A middle name as it should be printed.
 *
 * One letter is an INITIAL and takes a full stop — "A." — which is what makes
 * it read as an initial rather than as somebody whose middle name is the
 * letter A. Anything longer is a name and is left exactly as it was
 * recorded, because "Santos." is not a thing.
 *
 * A stop already there is left alone rather than doubled.
 */
export function middleInitial(middle?: string | null): string {
  const value = (middle ?? "").trim();

  if (value === "") return "";
  if (value.endsWith(".")) return value;

  return value.length === 1 ? `${value}.` : value;
}

/**
 * First, middle, last, suffix — joined from the parts that exist.
 *
 * Filtered rather than templated, because a missing middle name or suffix
 * must not leave a double space in the middle of somebody's name.
 */
export function personName(person: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
}): string {
  return [
    person.first_name,
    middleInitial(person.middle_name),
    person.last_name,
    person.suffix,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
