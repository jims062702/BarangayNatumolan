import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiFilePlus, FiDownload, FiUpload } from "react-icons/fi";
import ResidentTransferModal from "../../components/ResidentTransferModal";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import StatusBadge from "../../components/UI/StatusBadge";
import { inputClasses } from "../../components/UI/FormField";

/**
 * The RBIM baseline census forms.
 *
 * The BHW visits each household and the form is filled in ON PAPER. The
 * sheet reaches the Population Office, which types it in and then says, line
 * by line, who each person is on the register.
 *
 * So the list is organised by where each form has got to, not by when it was
 * typed — the question a clerk arrives with is "what is still waiting for
 * me", not "what did I do on Tuesday".
 */

interface CensusRow {
  id: number;
  census_no: string;
  household_head_name: string;
  respondent_name?: string | null;
  address_unit?: string | null;
  address_house_lot?: string | null;
  address_street?: string | null;
  household?: { id: number; household_number: string; zone_purok?: string | null } | null;
  total_members?: number | null;
  members_count: number;
  status: "Draft" | "Submitted";
  created_at?: string;
  recorder?: { id: number; name: string } | null;
}

const STATUSES = ["Draft", "Submitted"] as const;

/**
 * One line of address, from the parts the form collected.
 *
 * Any of them can be blank — a rural household may have no unit and no block
 * — so they are joined by what is actually there rather than laid out in
 * fixed positions with gaps where the empty ones were.
 */
function addressOf(row: CensusRow): string {
  return [
    row.address_unit,
    row.address_house_lot,
    row.address_street,
    row.household?.zone_purok,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export default function RbimList() {
  const [rows, setRows] = useState<CensusRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transfer, setTransfer] = useState<"import" | "export" | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get("/rbim", { params: { page, status: status || undefined, search: search || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
        setCounts(r.data.data.counts ?? {});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, search]);

  useAutoRefresh(() => load(), REFRESH.staff);

  return (
    <div>
      <PageHeader
        title="RBIM Baseline Census"
        subtitle="Registry of Barangay Inhabitants & Migrants — collected house to house by the BHW, recorded here"
        actions={
          <div className="flex flex-wrap gap-2">
            {/*
              Separate, because they are separate errands and one of them
              writes to the register. A clerk fetching a backup should not
              be one mis-click from an upload.
            */}
            <button
              type="button"
              onClick={() => setTransfer("export")}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray bg-white px-4 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
            >
              <FiDownload className="h-4 w-4" aria-hidden="true" /> Export
            </button>
            <button
              type="button"
              onClick={() => setTransfer("import")}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray bg-white px-4 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
            >
              <FiUpload className="h-4 w-4" aria-hidden="true" /> Import
            </button>
            <Link
              to="/population/rbim/new"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              <FiFilePlus className="h-4 w-4" aria-hidden="true" /> New census form
            </Link>
          </div>
        }
      />

      {/*
        What the three states mean, said once and plainly. A clerk opening
        this page for the first time should not have to infer a workflow
        from three coloured badges.
      */}
      <Card className="mb-4">
        <p className="text-xs leading-relaxed text-gray-600">
          The BHW visits each household and the form is filled in{" "}
          <strong className="text-dark">on paper</strong>. The sheet is then handed to this
          office, and it is recorded here.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-gray-600">
          <strong className="text-dark">Draft</strong> — being typed in; nobody is on the
          register yet. <span className="mx-1 text-gray-300">&rarr;</span>
          <strong className="text-dark">Submitted</strong> — the household has been registered,
          and every line names the resident it made. A submitted form stays editable: a
          household gains a baby or changes head, and submitting again adds only whoever is new.
        </p>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className={`${inputClasses} max-w-xs flex-1`}
            placeholder="Search form no., household head, address…"
            aria-label="Search census forms"
          />
          <button
            type="button"
            onClick={() => { setStatus(""); setPage(1); }}
            className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              status === "" ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
            }`}
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatus(s); setPage(1); }}
              className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                status === s ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {s}
              {counts[s] ? <span className="ml-1.5 opacity-70">{counts[s]}</span> : null}
            </button>
          ))}
        </div>

        <DataTable
          columns={[
            {
              header: "Form no.",
              render: (r: CensusRow) => (
                <Link
                  to={`/population/rbim/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.census_no}
                </Link>
              ),
            },
            {
              header: "Household head",
              render: (r: CensusRow) => (
                <span className="block">
                  <span className="font-medium text-dark">{r.household_head_name}</span>
                  {/*
                    The whole address, not just the street.

                    A street name alone does not say which house, and the
                    office reading this list is deciding which form to open —
                    two households on one street are indistinguishable until
                    they open both. The purok comes last because it is the
                    coarsest part, and it only appears once a form is tied to
                    a household on the register.
                  */}
                  {addressOf(r) && (
                    <span className="mt-0.5 block text-[11px] text-gray-400">{addressOf(r)}</span>
                  )}
                </span>
              ),
            },
            {
              header: "Members",
              /*
               * Two numbers, because they disagree and the gap matters: the
               * head says nine live here and eight lines were filled in.
               */
              render: (r: CensusRow) => (
                <span className="tabular-nums">
                  {r.members_count}
                  {r.total_members != null && r.total_members !== r.members_count && (
                    <span className="ml-1 text-xs text-warning">of {r.total_members} reported</span>
                  )}
                </span>
              ),
            },
            {
              header: "Collected by",
              render: (r: CensusRow) => r.recorder?.name ?? "—",
            },
            {
              header: "Filed",
              render: (r: CensusRow) =>
                r.created_at ? new Date(r.created_at).toLocaleDateString("en-PH") : "—",
            },
            { header: "Status", render: (r: CensusRow) => <StatusBadge status={r.status} /> },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="No census forms yet. Press “New census form” to start one."
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          total={total}
          numbered
        />
      </Card>

      <ResidentTransferModal
        open={transfer !== null}
        mode={transfer ?? "export"}
        onClose={() => setTransfer(null)}
        onImported={() => load()}
      />
    </div>
  );
}
