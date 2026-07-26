import { useMemo, useState, type ReactNode } from "react";
import { FiSearch } from "react-icons/fi";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

/** A dropdown filter: pick a value and only rows matching it are shown. */
export interface FilterDef<T> {
  label: string;
  /** The row's value for this filter (compared against the chosen option). */
  getValue: (row: T) => string;
  /** Explicit options; if omitted, the unique values in the data are used. */
  options?: string[];
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  page?: number;
  lastPage?: number;
  onPageChange?: (page: number) => void;
  /** Show a search box that filters the loaded rows by `getSearchText`. */
  searchable?: boolean;
  searchPlaceholder?: string;
  getSearchText?: (row: T) => string;
  /** Optional dropdown filters shown next to the search box. */
  filters?: FilterDef<T>[];
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage = "No records found.",
  page,
  lastPage,
  onPageChange,
  searchable = false,
  searchPlaceholder = "Search…",
  getSearchText,
  filters,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<number, string>>({});

  const hasToolbar = searchable || (filters?.length ?? 0) > 0;

  // Options for each filter — explicit, or derived from the loaded rows.
  const filterOptions = useMemo(
    () =>
      (filters ?? []).map((filter) =>
        filter.options ??
        Array.from(new Set(rows.map((r) => filter.getValue(r)).filter(Boolean))).sort()
      ),
    [filters, rows]
  );

  // Rows after client-side search + filters.
  const visibleRows = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (searchable && q && getSearchText) {
      out = out.filter((r) => getSearchText(r).toLowerCase().includes(q));
    }
    (filters ?? []).forEach((filter, index) => {
      const chosen = filterValues[index];
      if (chosen) out = out.filter((r) => filter.getValue(r) === chosen);
    });
    return out;
  }, [rows, query, filterValues, searchable, getSearchText, filters]);

  const filtering = query.trim() !== "" || Object.values(filterValues).some(Boolean);

  return (
    <div>
      {hasToolbar && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative min-w-56 flex-1">
              <FiSearch
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search this list"
                className="w-full rounded-full border border-gray bg-white py-2 pl-9 pr-4 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
          )}
          {(filters ?? []).map((filter, index) => (
            <select
              key={filter.label}
              value={filterValues[index] ?? ""}
              onChange={(e) =>
                setFilterValues((prev) => ({ ...prev, [index]: e.target.value }))
              }
              aria-label={filter.label}
              className="cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            >
              <option value="">{filter.label}: All</option>
              {filterOptions[index].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray">
        <table className="min-w-full divide-y divide-gray bg-white text-left text-sm">
          <thead className="bg-secondary">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${column.className ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray/70">
            {/* Keep showing current rows during background refreshes — the
                spinner only appears while the table is still empty. */}
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">
                  <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary align-middle" />
                  <span className="ml-3 align-middle">Loading…</span>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">
                  No matches for your search or filter.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-primary/[0.03]">
                {columns.map((column, index) => (
                  <td key={index} className={`px-4 py-3 align-middle ${column.className ?? ""}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Server pagination — hidden while a client-side search/filter is active
          (the page numbers would be misleading against a filtered subset). */}
      {!filtering && page !== undefined && lastPage !== undefined && lastPage > 1 && onPageChange && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="cursor-pointer rounded-lg border border-gray bg-white px-3 py-1.5 font-medium text-dark transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 text-gray-500">
            Page {page} of {lastPage}
          </span>
          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            className="cursor-pointer rounded-lg border border-gray bg-white px-3 py-1.5 font-medium text-dark transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
