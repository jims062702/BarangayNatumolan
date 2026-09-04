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

/**
 * Which page buttons to draw.
 *
 * Every page, while they fit. Past that, the first and last are always
 * reachable and a window follows the current page, with a gap marked where
 * pages were left out — a thousand buttons is not navigation.
 *
 * The window is fixed-width, so the row does not grow and shrink as the
 * clerk pages through it. A control that moves under the cursor is a control
 * that gets mis-clicked.
 */
function pageList(current: number, last: number): (number | "gap")[] {
  if (last <= 7) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, last, current]);

  // One either side of where they are, so the next page is always one press.
  for (const offset of [-1, 1]) {
    const page = current + offset;
    if (page > 1 && page < last) pages.add(page);
  }

  // Near an end there is no gap to fill, so the window opens out instead —
  // otherwise the row would be visibly shorter on pages 1 and 2.
  if (current <= 3) {
    [2, 3, 4].forEach((page) => page < last && pages.add(page));
  }
  if (current >= last - 2) {
    [last - 1, last - 2, last - 3].forEach((page) => page > 1 && pages.add(page));
  }

  const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const withGaps: (number | "gap")[] = [];

  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) withGaps.push("gap");
    withGaps.push(page);
  });

  return withGaps;
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
  /**
   * How many rows there are in total, across every page.
   *
   * Given it, the pagination can say WHICH rows are on screen — "Showing 21
   * to 37 of 37" — rather than only which page. A clerk counting a purok
   * needs the position, not the page number.
   */
  total?: number;
  /** Rows per page, so the range can be worked out. Defaults to 20. */
  perPage?: number;
  /**
   * Number the rows, continuing across pages: row 1 of page 2 is #21.
   * Restarting at 1 on every page is how a count of a purok comes out wrong.
   */
  numbered?: boolean;
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
  total,
  perPage = 20,
  numbered = false,
  searchable = false,
  searchPlaceholder = "Search…",
  getSearchText,
  filters,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  // The "go to page" box, opened from the gap between page numbers.
  const [jumping, setJumping] = useState(false);
  const [jumpTo, setJumpTo] = useState("");
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

  /*
   * On a phone the table is replaced by one card per row (see below). Action
   * columns carry buttons rather than a value, so they are pulled out of the
   * label/value list and given their own strip at the foot of the card.
   */
  const isActionColumn = (column: Column<T>) =>
    column.header.trim() === "" || column.header.trim().toLowerCase() === "actions";
  const dataColumns = columns.filter((c) => !isActionColumn(c));
  const actionColumns = columns.filter(isActionColumn);

  /*
   * Row numbers continue across pages: the first row of page 2 is #21, not
   * #1. Restarting each page is how a purok gets counted twice.
   *
   * Suppressed while a client-side filter is on — the numbers would run
   * 3, 7, 12 against a filtered subset, which reads as missing rows.
   */
  const firstRowNumber = ((page ?? 1) - 1) * perPage + 1;
  const showNumbers = numbered && !filtering;

  /** Loading / empty / no-match message, shared by the table and the cards. */
  const notice = loading && rows.length === 0
    ? "loading"
    : rows.length === 0
      ? emptyMessage
      : visibleRows.length === 0
        ? "No matches for your search or filter."
        : null;

  return (
    <div>
      {hasToolbar && (
        // Stacked on a phone: a search box and two dropdowns side by side leave
        // each about 110px wide, too narrow to read or to tap accurately.
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {searchable && (
            <div className="relative min-w-0 flex-1 sm:min-w-56">
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
              className="w-full cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 sm:w-auto"
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

      {/*
        Phones get one card per row instead of the table.
        A five-column table inside a 244px-wide scroll frame shows barely two
        columns, so Status and the action buttons — the whole reason to open a
        list — sat off-screen behind a horizontal scrollbar nobody finds.
      */}
      <div className="space-y-3 sm:hidden">
        {notice === "loading" && (
          <div className="rounded-xl border border-gray bg-white px-4 py-10 text-center text-gray-400">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary align-middle" />
            <span className="ml-3 align-middle">Loading…</span>
          </div>
        )}
        {notice !== null && notice !== "loading" && (
          <div className="rounded-xl border border-gray bg-white px-4 py-10 text-center text-sm text-gray-400">
            {notice}
          </div>
        )}
        {notice === null &&
          visibleRows.map((row) => (
            <div key={rowKey(row)} className="rounded-xl border border-gray bg-white p-4">
              <dl className="space-y-2">
                {dataColumns.map((column, index) => (
                  <div key={index} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {column.header}
                    </dt>
                    <dd className="min-w-0 break-words text-right text-sm text-dark">
                      {column.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
              {/*
                Every action control in the strip is floored at 36px tall and
                vertically centred. Row buttons are written for a table cell —
                `py-1.5 text-xs` lands at 26px, and a few bare text buttons at
                16px — which is a miss waiting to happen under a thumb.
              */}
              {actionColumns.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray/70 pt-3 [&_a]:inline-flex [&_a]:min-h-9 [&_a]:items-center [&_button]:inline-flex [&_button]:min-h-9 [&_button]:items-center">
                  {actionColumns.map((column, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      {column.render(row)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-gray sm:block">
        <table className="min-w-full divide-y divide-gray bg-white text-left text-sm">
          <thead className="bg-secondary">
            <tr>
              {showNumbers && (
                <th
                  scope="col"
                  className="w-12 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  #
                </th>
              )}
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
                <td colSpan={columns.length + (showNumbers ? 1 : 0)} className="px-4 py-10 text-center text-gray-400">
                  <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary align-middle" />
                  <span className="ml-3 align-middle">Loading…</span>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (showNumbers ? 1 : 0)} className="px-4 py-10 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (showNumbers ? 1 : 0)} className="px-4 py-10 text-center text-gray-400">
                  No matches for your search or filter.
                </td>
              </tr>
            )}
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-primary/[0.03]">
                {showNumbers && (
                  <td className="px-4 py-3 align-middle text-xs tabular-nums text-gray-400">
                    {firstRowNumber + rowIndex}
                  </td>
                )}
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
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm sm:justify-end">
          {/*
            Which rows these are, not just which page. A clerk checking a
            purok against a paper list needs the position in the whole set —
            "Page 2 of 2" does not tell them whether they have seen row 30.
          */}
          {total !== undefined && total > 0 && (
            <span className="mr-auto text-xs text-gray-500">
              Showing <span className="font-semibold text-dark">{firstRowNumber}</span> to{" "}
              <span className="font-semibold text-dark">
                {Math.min(firstRowNumber + visibleRows.length - 1, total)}
              </span>{" "}
              of <span className="font-semibold text-dark">{total}</span>
            </span>
          )}
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="cursor-pointer rounded-lg border border-gray bg-white px-3 py-1.5 font-medium text-dark transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          {pageList(page, lastPage).map((entry, index) =>
            entry === "gap" ? (
              /*
                The pages that were left out. A plain "…" is a dead end when
                the one you want is inside it, so it opens a box to type the
                number — which is the whole point of paging a 1,000-page
                register.
              */
              <button
                key={`gap-${index}`}
                type="button"
                onClick={() => setJumping(true)}
                title="Go to a page"
                className="cursor-pointer px-2 py-1.5 text-gray-400 transition-colors hover:text-primary"
              >
                …
              </button>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={`min-w-9 cursor-pointer rounded-lg border px-3 py-1.5 font-medium tabular-nums transition-colors ${
                  entry === page
                    ? "border-primary bg-primary text-white"
                    : "border-gray bg-white text-dark hover:border-primary hover:text-primary"
                }`}
              >
                {entry}
              </button>
            )
          )}

          {/* Typing the number beats pressing Next forty times. */}
          {jumping && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const wanted = Number(jumpTo);
                if (wanted >= 1 && wanted <= lastPage) onPageChange(wanted);
                setJumping(false);
                setJumpTo("");
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                type="number"
                min={1}
                max={lastPage}
                value={jumpTo}
                onChange={(e) => setJumpTo(e.target.value)}
                onBlur={() => setJumping(false)}
                placeholder={`1–${lastPage}`}
                aria-label={`Go to a page between 1 and ${lastPage}`}
                className="w-20 rounded-lg border border-primary px-2 py-1.5 text-sm outline-none"
              />
            </form>
          )}
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
