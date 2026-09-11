import { useEffect, useState } from "react";
import { FiUserX } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import SearchInput from "../../components/UI/SearchInput";

/**
 * The non-residents on the register, and whether they have an account.
 *
 * They are people the barangay deals with — living elsewhere, with business
 * here — and until now the account screens could not see them at all, because
 * not one of them has an account. A list of accounts showed an empty page and
 * was technically correct.
 *
 * So this reads the register and reports the account beside each name. Most
 * have none, and that is the fact worth being able to see: it is why a
 * non-resident asks for an appointment through the public form rather than
 * signing in.
 */

interface NonResident {
  id: number;
  resident_number: string | null;
  name: string;
  record_type: string;
  contact_number: string | null;
  address: string | null;
  account: {
    id: number;
    email: string;
    is_active: boolean;
    activated_at: string | null;
  } | null;
}

export default function NonResidents() {
  const [rows, setRows] = useState<NonResident[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ total: number; with_account: number }>();
  const [loading, setLoading] = useState(true);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api
      .get("/admin/non-residents", { params: { page, search: search || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
        setCounts(r.data.data.counts);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  useAutoRefresh(() => load(true), REFRESH.staff);

  /* The register moves when the Population Office adds somebody. */
  usePulse("residents", () => load(true));

  return (
    <div>
      <PageHeader
        title="Non-residents"
        subtitle="People on the register who live elsewhere. They are added by the Population Office, and most have no portal account — they ask for appointments through the public site instead."
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {counts && (
            <p className="w-full text-xs text-gray-500">
              <span className="font-semibold text-dark">{counts.total}</span> on the
              register ·{" "}
              <span className="font-semibold text-dark">{counts.with_account}</span> with
              a portal account
            </p>
          )}

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
        </div>

        <DataTable
          columns={[
            {
              header: "Name",
              render: (r: NonResident) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-dark">{r.name}</p>
                  {r.resident_number && (
                    <p className="font-mono text-xs text-gray-500">{r.resident_number}</p>
                  )}
                </div>
              ),
            },
            { header: "Type", render: (r: NonResident) => r.record_type },
            {
              header: "Contact",
              render: (r: NonResident) => r.contact_number || "—",
            },
            {
              header: "Address",
              render: (r: NonResident) => (
                <span className="line-clamp-2 max-w-xs text-xs text-gray-600">
                  {r.address || "—"}
                </span>
              ),
            },
            {
              /*
                The whole point of the column. "None" is not a gap to be
                filled — a non-resident having no portal account is the
                ordinary case, so it reads as a fact rather than a warning.
              */
              header: "Portal account",
              render: (r: NonResident) =>
                r.account ? (
                  <div className="min-w-0">
                    <p className="truncate text-xs text-dark">{r.account.email}</p>
                    <span
                      className={`text-[11px] font-semibold ${
                        r.account.is_active ? "text-success" : "text-danger"
                      }`}
                    >
                      {r.account.is_active ? "Active" : "Disabled"}
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                    <FiUserX className="h-3.5 w-3.5" aria-hidden="true" /> None
                  </span>
                ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          numbered
          total={total}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          emptyMessage="No non-residents on the register."
        />
      </Card>
    </div>
  );
}
