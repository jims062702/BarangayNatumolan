import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiEdit2 } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { Resident } from "../../types";

const PUROKS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5"];
const GENDERS = ["Male", "Female", "Other"];
const SECTORS = [
  "Senior Citizen",
  "PWD",
  "Solo Parent",
  "Youth",
  "Children Under Five",
  "Pregnant Women",
  "4Ps Household",
  "Unemployed",
  "Informal Worker",
];

const filterSelect =
  "cursor-pointer rounded-full border border-gray bg-white px-4 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";

export default function ResidentList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Resident[]>([]);
  const [search, setSearch] = useState("");
  const [purok, setPurok] = useState("");
  const [gender, setGender] = useState("");
  const [sector, setSector] = useState("");
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
        .get("/residents", {
          params: {
            page,
            search: search || undefined,
            zone_purok: purok || undefined,
            gender: gender || undefined,
            sector: sector || undefined,
          },
        })
        .then((r) => {
          setRows(r.data.data.data ?? []);
          setLastPage(r.data.data.last_page ?? 1);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, purok, gender, sector, tick]);

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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${inputClasses} max-w-xs flex-1`}
            placeholder="Search name or resident number…"
            aria-label="Search residents"
          />
          <select
            value={purok}
            onChange={(e) => { setPurok(e.target.value); setPage(1); }}
            aria-label="Filter by Purok"
            className={filterSelect}
          >
            <option value="">Purok: All</option>
            {PUROKS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={gender}
            onChange={(e) => { setGender(e.target.value); setPage(1); }}
            aria-label="Filter by gender"
            className={filterSelect}
          >
            <option value="">Gender: All</option>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select
            value={sector}
            onChange={(e) => { setSector(e.target.value); setPage(1); }}
            aria-label="Filter by sector"
            className={filterSelect}
          >
            <option value="">Sector: All</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(purok || gender || sector || search) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setPurok(""); setGender(""); setSector(""); setPage(1); }}
              className="cursor-pointer rounded-full px-3 py-2 text-sm font-medium text-gray-500 hover:text-primary"
            >
              Clear
            </button>
          )}
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
            {
              header: "Actions",
              render: (r: Resident) => (
                <Link
                  to={`/residents/${r.id}`}
                  title={canWrite ? "Edit information" : "View details"}
                  aria-label={canWrite ? "Edit information" : "View details"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray text-gray-500 transition-colors hover:border-primary hover:text-primary"
                >
                  <FiEdit2 className="h-4 w-4" />
                </Link>
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
