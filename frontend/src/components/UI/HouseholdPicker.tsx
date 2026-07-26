import { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiSearch, FiX } from "react-icons/fi";
import { api } from "../../lib/api";
import { inputClasses } from "./FormField";
import type { Household } from "../../types";

/** "HH-2026-0003 · Purok 3 · Owner: Juan Dela Cruz" */
export function householdLabel(h: Household): string {
  const owner = h.head ? `${h.head.first_name} ${h.head.last_name}` : "no owner set";
  return `${h.household_number} · ${h.zone_purok ?? "—"} · Owner: ${owner}`;
}

interface Props {
  /** Selected household_id as a string ("" = none). */
  value: string;
  /** The selected household object, used to show its label. */
  selected: Household | null;
  onSelect: (household: Household | null) => void;
  /** Optional "+ Register new household" action shown in the panel footer. */
  onAddNew?: () => void;
  placeholder?: string;
}

/**
 * Searchable household combobox. Instead of dumping every household into a
 * native <select> (which does not scale to a 20k+ registry — huge payload,
 * thousands of DOM nodes, endless scrolling), it queries the server as the
 * user types and only ever renders a small, capped result set.
 */
export default function HouseholdPicker({ value, selected, onSelect, onAddNew, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Household[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside the widget.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced server search while the panel is open (empty q = first page).
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get("/residents/household-options", { params: query.trim() ? { q: query.trim() } : {} })
        .then((r) => active && setResults(r.data.data ?? []))
        .catch(() => active && setResults([]))
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, open]);

  const openPanel = () => {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const choose = (h: Household | null) => {
    onSelect(h);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={boxRef} className="relative">
      {/* Trigger showing the current selection */}
      <button
        type="button"
        onClick={open ? () => setOpen(false) : openPanel}
        className={`${inputClasses} flex w-full cursor-pointer items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${selected ? "text-dark" : "text-gray-400"}`}>
          {selected ? householdLabel(selected) : placeholder ?? "Search household no., address, or owner…"}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <FiX
              aria-label="Clear household"
              className="text-gray-400 hover:text-danger"
              onClick={(e) => {
                e.stopPropagation();
                choose(null);
              }}
            />
          )}
          <FiChevronDown className="text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-2xl border border-gray bg-white p-2 shadow-lg">
          <div className="relative mb-2">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type household no., street, purok, or owner…"
              className={`${inputClasses} pl-9`}
            />
          </div>

          <div className="max-h-64 overflow-auto">
            <button
              type="button"
              onClick={() => choose(null)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary ${
                !value ? "font-semibold text-primary" : "text-gray-500"
              }`}
            >
              — No household —
            </button>

            {loading ? (
              <p className="px-3 py-3 text-center text-xs text-gray-400">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-gray-400">
                {query.trim() ? "No matching households." : "No households yet."}
              </p>
            ) : (
              results.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => choose(h)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary ${
                    String(h.id) === value ? "bg-secondary font-semibold text-primary" : "text-dark"
                  }`}
                >
                  {householdLabel(h)}
                </button>
              ))
            )}
          </div>

          {onAddNew && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddNew();
              }}
              className="mt-2 w-full cursor-pointer rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              + Register new household
            </button>
          )}
        </div>
      )}
    </div>
  );
}
