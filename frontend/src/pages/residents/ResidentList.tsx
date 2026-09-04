import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { toast } from "../../lib/toast";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import TagCell from "../../components/UI/TagCell";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { Resident } from "../../types";

// SANA MALAMBING

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
  const [total, setTotal] = useState(0);
  /*
   * Residents on the register who are NOT in the population figure —
   * today that means the deceased. Both numbers are right, and the gap
   * between them reads as a bug until something says what it is.
   */
  const [notCounted, setNotCounted] = useState(0);
  const [loading, setLoading] = useState(true);

  const canWrite =
    ["Main Office", "Population"].includes(user?.office ?? "") ||
    ["Punong Barangay", "Admin"].includes(user?.role ?? "");

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.staff);

  /**
   * Removes a resident, or retires them when removing would take real records
   * with them.
   *
   * A register is not a list that can simply have rows taken out of it. A
   * resident who has been issued a certificate, been seen at the health
   * station, or appeared in a KP or VAWC case is referenced by documents the
   * barangay is required to keep, and deleting the person would either orphan
   * those or quietly destroy them. The server refuses and says which; the
   * clerk is then offered the honest alternative — mark the record inactive,
   * keep everything attached to it.
   *
   * Both paths are confirmed, because neither is something to discover after
   * the fact.
   */
  const removeResident = async (resident: Resident) => {
    const name = [resident.first_name, resident.last_name].filter(Boolean).join(" ");

    if (
      !(await confirmAction({
        title: `Delete ${name}?`,
        text: "Everything of theirs goes with them: the registry record, their "
          + "portal account and its email, their sector tags, family links and any "
          + "chat with the barangay. This cannot be undone.",
        confirmText: "Yes, delete",
        cancelText: "Keep the record",
        danger: true,
      }))
    ) {
      return;
    }

    try {
      const response = await api.delete(`/residents/${resident.id}`);
      // The server lists what else was removed; repeating it is how the
      // clerk learns the portal login is gone too.
      toast(response.data?.message ?? `${name} was removed from the registry.`);
      setTick((t) => t + 1);
      return;
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { errors?: { blockers?: Record<string, number> } } } })
        .response;

      // Anything other than "they have records" is the clerk's to read.
      if (response?.status !== 409) {
        toast(errorMessage(err), "error");
        return;
      }

      const blockers = response.data?.errors?.blockers ?? {};
      const held = Object.entries(blockers)
        .map(([label, count]) => `${label} (${count})`)
        .join(", ");

      if (
        !(await confirmAction({
          title: `${name} cannot be deleted`,
          text: `Records the barangay must keep are attached to them — ${held || "issued documents"}. `
            + "Mark them inactive instead — they leave the active registry and every one of "
            + "those records stays where it is.",
          confirmText: "Yes, mark inactive",
          cancelText: "Leave them as they are",
        }))
      ) {
        return;
      }

      try {
        await api.delete(`/residents/${resident.id}`, { params: { deactivate: 1 } });
        toast(`${name} is now inactive. Their records were kept.`);
        setTick((t) => t + 1);
      } catch (deactivateError) {
        toast(errorMessage(deactivateError), "error");
      }
    }
  };

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
          setTotal(r.data.data.total ?? 0);
          setNotCounted(r.data.data.not_in_population ?? 0);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, purok, gender, sector, tick]);

  return (
    <div>
      {/*
        No Register button.

        Everybody reaches this register through an RBIM census: the BHW fills
        the sheet in at the household, the office types it up, and submitting
        it is what creates the records. A second door here would let a person
        onto the register with no census line behind them — and then the two
        accounts of that household disagree, with nothing saying which is
        right.
      */}
      <PageHeader
        title="Residents & Households"
        subtitle="Master registry of Barangay Natumolan residents — registered through the RBIM census"
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
          {/*
            Shown as soon as there IS a number, not only when nothing is
            loading. The list refreshes itself every few seconds, and
            hiding this during each refresh made it blink out and back —
            which reads as a fault rather than as a reload.
          */}
          {total > 0 && (
            <span className="ml-auto text-xs text-gray-400">
              {total} on the register
              {notCounted > 0 && (
                <span title="Deceased residents stay on the register but are not part of the population.">
                  {" · "}
                  <span className="font-semibold text-dark">
                    {total - notCounted} counted in the population
                  </span>
                </span>
              )}
            </span>
          )}
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
              /*
               * The partner goes under the name, not in a column of their own.
               *
               * Who is married to whom is the question the list could not
               * answer at all — but it is not worth another column's width on
               * a table that already has too little. Under the name it costs
               * nothing horizontally, and only the rows that HAVE a partner
               * get any taller.
               *
               * The word comes from the server: "Wife" and "Husband" say
               * married, and two people living together are partners.
               */
              render: (r: Resident) => (
                <span className="block">
                  <span className="font-medium text-dark">
                    {r.first_name} {r.middle_name ? `${r.middle_name.charAt(0)}.` : ""}{" "}
                    {r.last_name}
                  </span>
                  {r.spouse && (
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      {r.spouse_label ?? "Spouse"}:{" "}
                      <span className="text-gray-500">
                        {r.spouse.first_name} {r.spouse.last_name}
                      </span>
                    </span>
                  )}
                </span>
              ),
            },
            { header: "Purok", render: (r: Resident) => r.zone_purok ?? "—" },
            { header: "Gender", render: (r: Resident) => r.gender ?? "—" },
            {
              header: "Sectors",
              /*
               * Three tags, then a button for the rest.
               *
               * A resident in nine sector lists wrapped onto three lines and
               * pushed every other row apart, so a page of twenty became a
               * page of scrolling. Three is what fits without doing that.
               *
               * The rest are behind "+N more", pressed rather than hovered:
               * a clerk cannot hover over something they do not know is
               * there, and a sector nobody knows about is a sector nobody
               * acts on.
               */
              render: (r: Resident) => (
                <TagCell labels={(r.sectors ?? []).map((s) => s.sector_type)} />
              ),
            },
            {
              header: "Status",
              render: (r: Resident) =>
                // Deceased outranks "inactive": both are off the active
                // register, but only one of them says WHY.
                r.life_status === "Deceased" ? (
                  <span
                    className="rounded-full bg-dark/10 px-2.5 py-1 text-xs font-semibold text-dark"
                    title={
                      r.date_of_death
                        ? `Passed away ${new Date(r.date_of_death).toLocaleDateString("en-PH")}`
                        : "Recorded as deceased"
                    }
                  >
                    Deceased
                  </span>
                ) : r.record_type === "Non-resident" ? (
                  <span
                    className="rounded-full bg-gray px-2.5 py-1 text-xs font-semibold text-gray-500"
                    title="Lives outside the barangay — recorded so a family could be linked"
                  >
                    Outside
                  </span>
                ) : r.is_active ? (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Active</span>
                ) : (
                  <span className="rounded-full bg-gray px-2.5 py-1 text-xs font-semibold text-gray-500">Inactive</span>
                ),
            },
            {
              header: "Actions",
              render: (r: Resident) => (
                <span className="flex items-center gap-1.5">
                  <Link
                    to={`/residents/${r.id}`}
                    title={canWrite ? "Edit information" : "View details"}
                    aria-label={canWrite ? "Edit information" : "View details"}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray text-gray-500 transition-colors hover:border-primary hover:text-primary"
                  >
                    <FiEdit2 className="h-4 w-4" />
                  </Link>
                  {/*
                    Only for the office that maintains the register, and only
                    ever behind a confirmation — the row beside it is the one
                    the clerk actually meant to open.
                  */}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => void removeResident(r)}
                      title={`Delete ${r.first_name} ${r.last_name}`}
                      aria-label={`Delete ${r.first_name} ${r.last_name}`}
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-gray text-gray-500 transition-colors hover:border-danger hover:text-danger"
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  )}
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
        />
      </Card>

    </div>
  );
}
