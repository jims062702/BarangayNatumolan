import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { inputClasses } from "./UI/FormField";
import type { Resident } from "../types";

interface ResidentPickerProps {
  value: Resident | null;
  onChange: (resident: Resident | null) => void;
}

/** Search-as-you-type resident selector (uses /residents/search). */
export default function ResidentPicker({ value, onChange }: ResidentPickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Resident[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get("/residents/search", { params: { q: query.trim() } })
        .then((r) => setOptions(r.data.data ?? []))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm">
        <span className="font-medium text-dark">
          {value.first_name} {value.last_name}{" "}
          <span className="text-xs text-gray-500">({value.resident_number})</span>
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
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={inputClasses}
        placeholder="Search by name or resident number…"
        aria-label="Search residents"
      />
      {options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray bg-white shadow-lg">
          {options.map((resident) => (
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
                <span className="font-medium text-dark">
                  {resident.first_name} {resident.last_name}
                </span>{" "}
                <span className="text-xs text-gray-500">{resident.resident_number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
