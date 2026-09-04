import { useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { api } from "../lib/api";
import { inputClasses } from "./UI/FormField";
import type { Resident } from "../types";

interface Props {
  value: Resident[];
  onChange: (residents: Resident[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Residents named on the other side of the case — never offered here. */
  excludeIds?: number[];
}

const fullName = (r: Resident) =>
  [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(" ");

const ageOf = (birthdate?: string | null) => {
  if (!birthdate) return null;
  return Math.floor((Date.now() - new Date(birthdate).getTime()) / 31557600000);
};

/**
 * Picks several residents at once — used where a record involves more than one
 * person (VAWC dependents, multiple respondents). Selected people show as
 * removable chips so the set is visible without opening anything.
 */
export default function ResidentMultiPicker({
  value,
  onChange,
  placeholder = "Start typing a name or resident number…",
  disabled,
  excludeIds = [],
}: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++latest.current;
    const timer = setTimeout(() => {
      api
        .get("/residents/search", { params: { q: term } })
        .then((r) => {
          if (seq === latest.current) setOptions(r.data.data ?? []);
        })
        .catch(() => {
          if (seq === latest.current) setOptions([]);
        })
        .finally(() => {
          if (seq === latest.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const add = (resident: Resident) => {
    if (!value.some((r) => r.id === resident.id)) onChange([...value, resident]);
    setQuery("");
    setOptions([]);
  };

  const remove = (id: number) => onChange(value.filter((r) => r.id !== id));

  // Already-picked people, and anyone on the other side of the case, drop
  // out of the suggestions.
  const suggestions = options.filter(
    (o) => !value.some((r) => r.id === o.id) && !excludeIds.includes(o.id)
  );

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 py-1 pl-3 pr-1.5 text-xs"
            >
              <span className="font-medium text-dark">{fullName(r)}</span>
              {ageOf(r.birthdate) !== null && (
                <span className="text-gray-400">{ageOf(r.birthdate)} yrs</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${fullName(r)}`}
                  onClick={() => remove(r.id)}
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <FiX className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClasses}
          placeholder={placeholder}
          aria-label="Search residents to add"
        />
        {loading && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            Searching…
          </span>
        )}
        {suggestions.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray bg-white shadow-lg">
            {suggestions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => add(r)}
                  className="w-full cursor-pointer px-3.5 py-2 text-left text-sm hover:bg-primary/5"
                >
                  <span className="block">
                    <span className="font-medium text-dark">{fullName(r)}</span>{" "}
                    <span className="text-xs text-gray-500">{r.resident_number}</span>
                  </span>
                  {(ageOf(r.birthdate) !== null || r.zone_purok) && (
                    <span className="block text-xs text-gray-400">
                      {[ageOf(r.birthdate) !== null ? `${ageOf(r.birthdate)} yrs` : null, r.zone_purok]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
