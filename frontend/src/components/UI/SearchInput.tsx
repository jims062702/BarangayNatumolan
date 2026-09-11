import { useRef } from "react";
import { FiSearch, FiX } from "react-icons/fi";

/**
 * A search box that can be emptied without holding down backspace.
 *
 * Every list in this system filters as you type, so a box left with three
 * stale characters in it is a list showing almost nothing — and the way out
 * was to select the text and delete it. The cross appears only when there is
 * something to clear, so it is never a button that does nothing.
 *
 * Focus returns to the field afterwards. Clearing a search is almost always
 * the start of typing a different one, and being dropped out of the box to go
 * back to it is the kind of small friction nobody reports and everybody feels.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search this list",
  className = "",
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** What a screen reader is told this box searches. */
  label?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);

  const clear = () => {
    onChange("");
    input.current?.focus();
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <FiSearch
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      />

      <input
        ref={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        /* Escape empties it, which is what the key does in every other search
           box a person has used. */
        onKeyDown={(e) => {
          if (e.key === "Escape" && value !== "") {
            e.preventDefault();
            clear();
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        /* Room on the right for the cross, so a long query does not run
           underneath it. */
        className="w-full rounded-full border border-gray bg-white py-2 pl-9 pr-10 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
      />

      {value !== "" && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear the search"
          title="Clear"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <FiX className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
