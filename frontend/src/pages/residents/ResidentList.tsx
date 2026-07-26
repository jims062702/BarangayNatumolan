import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { Resident } from "../../types";

export default function ResidentList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Resident[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const canWrite =
    ["Main Office", "Population"].includes(user?.office ?? "") ||
    ["Punong Barangay", "Admin"].includes(user?.role ?? "");

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.staff);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get("/residents", { params: { page, search: search || undefined } })
        .then((r) => {
          setRows(r.data.data.data ?? []);
          setLastPage(r.data.data.last_page ?? 1);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, tick]);

  return (
    <div>
      <PageHeader
        title="Residents & Households"
        subtitle="Master registry of Barangay Natumolan residents"
        actions={
          canWrite && (
            <Link
              to="/residents/create"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              + Register resident
            </Link>
          )
        }
      />

      <Card>
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${inputClasses} max-w-sm`}
            placeholder="Search name or resident number…"
            aria-label="Search residents"
          />
        </div>

        <DataTable
          columns={[
            {
              header: "Resident #",
              render: (r: Resident) => (
                <Link to={`/residents/${r.id}`} className="font-medium text-primary hover:underline">
                  {r.resident_number}
                </Link>
              ),
            },
            {
              header: "Name",
              render: (r: Resident) => (
                <span className="font-medium text-dark">
                  {r.first_name} {r.middle_name ? `${r.middle_name.charAt(0)}.` : ""} {r.last_name}
                </span>
              ),
            },
            { header: "Purok", render: (r: Resident) => r.zone_purok ?? "—" },
            { header: "Gender", render: (r: Resident) => r.gender ?? "—" },
            {
              header: "Sectors",
              render: (r: Resident) =>
                (r.sectors ?? []).length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {r.sectors?.map((s) => (
                      <span key={s.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {s.sector_type}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                ),
            },
            {
              header: "Status",
              render: (r: Resident) =>
                r.is_active ? (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Active</span>
                ) : (
                  <span className="rounded-full bg-gray px-2.5 py-1 text-xs font-semibold text-gray-500">Inactive</span>
                ),
            },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
