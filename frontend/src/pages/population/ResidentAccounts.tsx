import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { User } from "../../types";

export default function ResidentAccounts() {
  const [rows, setRows] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/population/accounts", { params: { page, search: search || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  const toggle = async (user: User) => {
    setFeedback("");
    try {
      await api.post(`/population/accounts/${user.id}/toggle`);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Resident Portal Accounts"
        subtitle="Accounts issued by this office after residency verification. Create new accounts from a resident's profile page."
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">{feedback}</p>
      )}

      <Card>
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${inputClasses} max-w-sm`}
            placeholder="Search name or email…"
            aria-label="Search resident accounts"
          />
        </div>

        <DataTable
          columns={[
            { header: "Name", render: (u: User) => <span className="font-medium text-dark">{u.name}</span> },
            { header: "Email", render: (u: User) => u.email },
            {
              header: "Resident No.",
              render: (u: User) => u.resident?.resident_number ?? "—",
            },
            { header: "Purok", render: (u: User) => u.resident?.zone_purok ?? "—" },
            {
              header: "Status",
              render: (u: User) =>
                u.is_active ? (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Active</span>
                ) : (
                  <span className="rounded-full bg-gray px-2.5 py-1 text-xs font-semibold text-gray-500">Deactivated</span>
                ),
            },
            {
              header: "",
              render: (u: User) => (
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    u.is_active
                      ? "border border-danger/40 text-danger hover:bg-danger hover:text-white"
                      : "border border-success/40 text-success hover:bg-success hover:text-white"
                  }`}
                >
                  {u.is_active ? "Deactivate" : "Activate"}
                </button>
              ),
            },
          ]}
          rows={rows}
          rowKey={(u) => u.id}
          loading={loading}
          emptyMessage="No portal accounts yet — create one from a resident's profile."
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
