import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiEdit2, FiUserCheck } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import type { Resident } from "../../types";
import SearchInput from "../../components/UI/SearchInput";

/**
 * The people on the register who do not live here.
 *
 * A mother working in Riyadh, a father in Cebu, a step-parent two towns over:
 * every one of them is on the register so a family can be recorded whole, and
 * none of them is a constituent. They have no purok, no sector, no portal
 * account, and they are not in the population count.
 *
 * They had nowhere of their own to be looked at. The registry list hides them
 * — rightly, since a purok roll with absent relatives in it is a wrong number
 * reported to the municipality — which left them findable only by opening the
 * relative who named them and reading down the family panel.
 *
 * So they get their own list, asked the way they are actually looked for:
 * by name, by where they are living, and by WHOSE relative they are. The
 * columns follow from that — no purok, no sectors, because they have none.
 */
export default function NonResidentList() {
  const [rows, setRows] = useState<Resident[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.staff);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get("/residents", {
          params: { page, search: search || undefined, record_type: "Non-resident" },
        })
        .then((r) => {
          setRows(r.data.data.data ?? []);
          setLastPage(r.data.data.last_page ?? 1);
          setTotal(r.data.data.total ?? 0);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, tick]);

  /** Whose relative they are — the reason the record exists. */
  const belongsTo = (person: Resident): string => {
    const names = [...(person.children ?? []), ...(person.parents ?? [])]
      .map((relative) => `${relative.first_name ?? ""} ${relative.last_name ?? ""}`.trim())
      .filter(Boolean);

    if (names.length === 0) return "";

    return names.length > 2
      ? `${names.slice(0, 2).join(", ")} +${names.length - 2}`
      : names.join(", ");
  };

  return (
    <div>
      <PageHeader
        title="Non-residents"
        subtitle="Relatives on the register who live outside Barangay Natumolan"
      />

      <Card>
        <p className="mb-4 rounded-xl bg-secondary/70 px-4 py-3 text-xs leading-relaxed text-gray-600">
          These records exist so families can be recorded whole. They are{" "}
          <strong>not counted in the population</strong>, hold no purok or sector, and get no
          portal account. They are added from a relative&rsquo;s profile &mdash; Add parent, child
          or spouse, answering &ldquo;Outside the barangay&rdquo; &mdash; not registered here. If
          one of them moves in, open their record and use{" "}
          <strong>Convert to resident</strong>: their family links come with them, and no duplicate
          is left behind.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search name or record number…"
            label="Search non-residents"
            className="max-w-sm flex-1"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="cursor-pointer rounded-full px-3 py-2 text-sm font-medium text-gray-500 hover:text-primary"
            >
              Clear
            </button>
          )}
          {/* Same as the registry list: hiding it on every background
              refresh made it blink out and back. */}
          {total > 0 && (
            <span className="ml-auto text-xs text-gray-400">
              {total} record{total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <DataTable
          columns={[
            {
              header: "Record #",
              render: (r: Resident) => (
                <Link
                  to={`/residents/non-residents/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.resident_number}
                </Link>
              ),
            },
            {
              header: "Name",
              render: (r: Resident) => (
                <span className="font-medium text-dark">
                  {r.first_name} {r.middle_name ? `${r.middle_name.charAt(0)}.` : ""} {r.last_name}
                  {r.suffix ? ` ${r.suffix}` : ""}
                </span>
              ),
            },
            {
              header: "Living in",
              render: (r: Resident) =>
                r.address ? (
                  r.address
                ) : (
                  <span className="text-gray-400">Not recorded</span>
                ),
            },
            {
              header: "Contact",
              render: (r: Resident) =>
                r.contact_number ?? <span className="text-gray-400">—</span>,
            },
            {
              // The whole reason the record is on the register.
              header: "Relative of",
              render: (r: Resident) => {
                const names = belongsTo(r);
                return names ? (
                  <span className="text-sm text-dark">{names}</span>
                ) : (
                  <span className="text-xs text-warning">Not linked to anyone</span>
                );
              },
            },
            {
              header: "Actions",
              render: (r: Resident) => (
                <span className="flex items-center gap-1.5">
                  <Link
                    to={`/residents/non-residents/${r.id}`}
                    title="Open record"
                    aria-label={`Open ${r.first_name} ${r.last_name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray text-gray-500 transition-colors hover:border-primary hover:text-primary"
                  >
                    <FiEdit2 className="h-4 w-4" />
                  </Link>
                  <Link
                    to={`/residents/non-residents/${r.id}`}
                    title="They moved in — convert on their record"
                    aria-label={`Convert ${r.first_name} ${r.last_name} to a resident`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray text-gray-500 transition-colors hover:border-success hover:text-success"
                  >
                    <FiUserCheck className="h-4 w-4" />
                  </Link>
                </span>
              ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          total={total}
          numbered
          emptyMessage="No non-resident records yet. They appear here once a relative who lives elsewhere is added to a family."
        />
      </Card>
    </div>
  );
}
