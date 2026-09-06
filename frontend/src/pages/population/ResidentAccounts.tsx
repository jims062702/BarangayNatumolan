import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { User } from "../../types";

export default function ResidentAccounts() {
  const [rows, setRows] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  // "Not activated" is the list this office actually works: those accounts
  // exist but nobody has proved the mailbox behind them is theirs.
  const [activation, setActivation] = useState<"" | "pending" | "done">("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  /*
   * How many sit under each chip. Of the whole list rather than the page,
   * and unmoved by which chip is picked — otherwise the chosen one would
   * read its total and every other would read zero, which is exactly the
   * question the chips are there to answer.
   */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get("/population/accounts", {
        params: { page, search: search || undefined, activation: activation || undefined },
      })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setCounts(r.data.data.counts ?? {});
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, activation]);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  /** "I never got the email" — sends the resident a fresh activation code. */
  const resend = async (user: User) => {
    try {
      const response = await api.post(`/population/accounts/${user.id}/resend-activation`);
      toast(response.data.message);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const toggle = async (user: User) => {
    const deactivating = user.is_active !== false;
    if (
      !(await confirmAction({
        title: deactivating ? "Deactivate this account?" : "Reactivate this account?",
        text: deactivating
          ? `${user.name} will no longer be able to sign in.`
          : `${user.name} will be able to sign in again.`,
        confirmText: deactivating ? "Yes, deactivate" : "Yes, reactivate",
        danger: deactivating,
      }))
    )
      return;
    try {
      await api.post(`/population/accounts/${user.id}/toggle`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Resident Portal Accounts"
        subtitle="Created automatically when a resident is registered. Each one stays inactive until the resident enters the code emailed to them."
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <div className="flex gap-2">
            {(
              [
                ["", "All"],
                ["pending", "Not activated"],
                ["done", "Activated"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => {
                  setActivation(value);
                  setPage(1);
                }}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  activation === value ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
                }`}
              >
                {label}
                {value && counts[value] ? (
                  <span className="ml-1.5 opacity-70">{counts[value]}</span>
                ) : null}
              </button>
            ))}
          </div>
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
              // Two separate things, so they get two separate columns:
              // whether the office allows this login at all, and whether the
              // resident has confirmed the mailbox is theirs.
              header: "Sign-in",
              render: (u: User) =>
                u.is_active ? (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Enabled</span>
                ) : (
                  <span className="rounded-full bg-gray px-2.5 py-1 text-xs font-semibold text-gray-500">Disabled</span>
                ),
            },
            {
              header: "Email verified",
              render: (u: User) =>
                u.activated_at ? (
                  <span className="text-xs text-gray-500">
                    {new Date(u.activated_at).toLocaleDateString("en-PH")}
                  </span>
                ) : (
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                    Not activated
                  </span>
                ),
            },
            {
              header: "",
              render: (u: User) => (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {!u.activated_at && (
                    <button
                      type="button"
                      onClick={() => resend(u)}
                      className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                      title="Email this resident a fresh 6-digit activation code"
                    >
                      Resend code
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggle(u)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      u.is_active
                        ? "border border-danger/40 text-danger hover:bg-danger hover:text-white"
                        : "border border-success/40 text-success hover:bg-success hover:text-white"
                    }`}
                  >
                    {u.is_active ? "Disable" : "Enable"}
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(u) => u.id}
          numbered
          total={total}
          loading={loading}
          emptyMessage="No portal accounts match this view."
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
