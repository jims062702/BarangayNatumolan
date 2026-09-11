import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import Modal from "../../components/UI/Modal";
import type { User } from "../../types";
import SearchInput from "../../components/UI/SearchInput";

export default function ResidentAccounts() {
  const [rows, setRows] = useState<User[]>([]);

  /*
   * Setting a password at the counter.
   *
   * For the resident who cannot get at the email on their record — a changed
   * number, a shared inbox, a phone that is gone. No code is sent: the person
   * is standing there, and the counter has already identified them.
   */
  const [resetting, setResetting] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordAgain, setNewPasswordAgain] = useState("");
  const [saving, setSaving] = useState(false);
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

  /*
   * `silent` is for the background timer.
   *
   * A refresh nobody asked for must not blank the page somebody is
   * reading; a first load or a filter change should still say it is
   * working. Same fetch, and only the announcement differs.
   */
  const load = (silent = false) => {
    if (!silent) setLoading(true);
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
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("users", () => load(true));

  /** "I never got the email" — sends the resident a fresh activation code. */
  const resend = async (user: User) => {
    try {
      const response = await api.post(`/population/accounts/${user.id}/resend-activation`);
      toast(response.data.message);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const setCounterPassword = async () => {
    if (!resetting) return;

    setSaving(true);

    try {
      await api.post(`/population/accounts/${resetting.id}/reset-password`, {
        password: newPassword,
        password_confirmation: newPasswordAgain,
      });

      toast(`Password set for ${resetting.name}. Tell them to sign in with it now.`);
      setResetting(null);
      setNewPassword("");
      setNewPasswordAgain("");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
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
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            label="Search resident accounts"
            className="max-w-sm flex-1"
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
                    onClick={() => {
                      setResetting(u);
                      setNewPassword("");
                      setNewPasswordAgain("");
                    }}
                    className="cursor-pointer rounded-full border border-gray px-3 py-1 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                    title="Set a password at the counter, for a resident who cannot reach their email"
                  >
                    Set password
                  </button>
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

      <Modal
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title={resetting ? `Set a password for ${resetting.name}` : "Set a password"}
      >
        <div className="space-y-5 p-5">
          {/*
            Said before the fields, not after.

            Two things a clerk needs to know before typing: they will have to
            say this out loud, and doing it ends whatever session the resident
            has open — which is the point when a phone has been lost, and a
            surprise when it has not.
          */}
          <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-dark">
            No code is sent for this. Type a password, tell the resident what it
            is, and ask them to change it from their profile once they are in.
            They will be signed out of any device they are currently using.
          </div>

          <FormField label="New password" hint="At least 8 characters">
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClasses}
              minLength={8}
              autoComplete="off"
              autoFocus
            />
          </FormField>

          <FormField label="Type it again">
            <input
              type="text"
              value={newPasswordAgain}
              onChange={(e) => setNewPasswordAgain(e.target.value)}
              className={inputClasses}
              minLength={8}
              autoComplete="off"
            />
            {newPasswordAgain !== "" && newPassword !== newPasswordAgain && (
              <span className="mt-1.5 block text-xs font-medium text-danger">
                The two do not match.
              </span>
            )}
          </FormField>

          <div className="flex justify-end gap-3 border-t border-gray pt-4">
            <button
              type="button"
              onClick={() => setResetting(null)}
              className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition hover:border-primary/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={setCounterPassword}
              disabled={
                saving || newPassword.length < 8 || newPassword !== newPasswordAgain
              }
              className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Set this password"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
