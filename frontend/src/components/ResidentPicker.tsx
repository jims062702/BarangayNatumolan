import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Resident } from "../types";
import SearchInput from "../components/UI/SearchInput";

interface ResidentPickerProps {
  value: Resident | null;
  onChange: (resident: Resident | null) => void;
  /**
   * Residents who must not be offered — someone already named on the other
   * side of the same case cannot also be picked here.
   */
  excludeIds?: number[];
  /**
   * Leave out people who live outside the barangay.
   *
   * For anything the barangay ISSUES. A certificate says something about a
   * constituent, and a non-resident is on the register only so a family could
   * be recorded whole — offering them here invites a false document with a
   * real reference number on it. The server refuses either way; this stops
   * the clerk getting that far.
   */
  residentsOnly?: boolean;
  /**
   * ONLY people who live outside the barangay.
   *
   * The other side of `residentsOnly`, for the one question where a
   * non-resident is the right answer: naming a parent who lives elsewhere
   * and is already on file, so a second child by the same mother does not
   * mean typing her in again \u2014 and does not create a duplicate of her.
   */
  nonResidentsOnly?: boolean;
}

const fullName = (r: Resident) =>
  [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(" ");

const ageOf = (birthdate?: string | null) => {
  if (!birthdate) return null;
  const born = new Date(birthdate);
  const diff = Date.now() - born.getTime();
  return Math.floor(diff / 31557600000); // ms per average year
};

/**
 * What tells two namesakes apart: age and purok. Shown under every option so
 * picking the right "Juan Dela Cruz" doesn't depend on memorising numbers.
 */
const distinguisher = (r: Resident) => {
  const age = ageOf(r.birthdate);
  /*
   * The two facts that change what a clerk should do with the person they
   * just picked: someone who has died should not be having a certificate
   * filed for them, and someone who lives elsewhere is not a constituent.
   * Both are easy to miss when the names look identical.
   */
  const flag =
    r.life_status === "Deceased"
      ? "DECEASED"
      : r.record_type === "Non-resident"
        ? "Lives outside the barangay"
        : null;

  return [flag, age !== null ? `${age} yrs` : null, r.zone_purok].filter(Boolean).join(" · ");
};

/** Search-as-you-type resident selector (uses /residents/search). */
export default function ResidentPicker({
  value,
  onChange,
  excludeIds = [],
  residentsOnly = false,
  nonResidentsOnly = false,
}: ResidentPickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Keeps a slow earlier response from overwriting a newer one.
  const latest = useRef(0);

  // Searches from the very first letter — a clerk typing "B" should already
  // see the B names rather than waiting for a second character.
  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setOptions([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const seq = ++latest.current;
    const timer = setTimeout(() => {
      api
        .get("/residents/search", {
          params: {
            q: term,
            // Narrowed on the SERVER: the row limit has to be spent on the
            // kind of person being looked for.
            record_type: residentsOnly ? "Resident" : nonResidentsOnly ? "Non-resident" : undefined,
          },
        })
        .then((r) => {
          if (seq !== latest.current) return;
          setOptions(r.data.data ?? []);
        })
        .catch(() => {
          if (seq === latest.current) setOptions([]);
        })
        .finally(() => {
          if (seq !== latest.current) return;
          setLoading(false);
          setSearched(true);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, residentsOnly, nonResidentsOnly]);

  const visible = options.filter(
    (o) =>
      !excludeIds.includes(o.id) &&
      !(residentsOnly && o.record_type === "Non-resident") &&
      !(nonResidentsOnly && o.record_type !== "Non-resident")
  );

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm">
        <span className="font-medium text-dark">
          {fullName(value)}
          {value.resident_number && <span className="text-xs text-gray-500"> ({value.resident_number})</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="cursor-pointer text-xs font-semibold text-danger hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Start typing a name or resident number…"
        label="Search residents"
      />
      {loading && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          Searching…
        </span>
      )}
      {visible.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray bg-white shadow-lg">
          {visible.map((resident) => (
            <li key={resident.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(resident);
                  setQuery("");
                  setOptions([]);
                }}
                className="w-full cursor-pointer px-3.5 py-2.5 text-left text-sm hover:bg-primary/5"
              >
                <span className="block">
                  <span className="font-medium text-dark">{fullName(resident)}</span>{" "}
                  <span className="text-xs text-gray-500">{resident.resident_number}</span>
                </span>
                {distinguisher(resident) && (
                  <span className="block text-xs text-gray-400">{distinguisher(resident)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && !loading && visible.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-xl border border-gray bg-white px-3.5 py-2.5 text-xs text-gray-400 shadow-lg">
          No resident matches “{query.trim()}”.
        </p>
      )}
    </div>
  );
}
