import { Link } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { FiEdit2, FiPlus, FiTrash2, FiUserCheck, FiUserX } from "react-icons/fi";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { User } from "../../types";
import SearchInput from "../../components/UI/SearchInput";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Each role's office. Must stay in step with AdminUserController::ROLES /
 * ::OFFICES and the users-table enums — the SK roles were missing here, so an
 * SK account could not be created from this form at all.
 */
const ROLE_OFFICE: Record<string, string> = {
  "Punong Barangay": "Main Office",
  Secretary: "Main Office",
  Clerk: "Main Office",
  "VAWC Officer": "VAWC",
  "Lupon Secretary": "Lupon",
  "Population Worker": "Population",
  "Health Personnel": "Health Station",
  "SK Chairperson": "SK",
  "SK Kagawad": "SK",
  "SK Secretary": "SK",
  Admin: "Admin",
};

export default function UserManagement({
  /*
   * Which register this is. Taken from the route rather than a tab, so the
   * two lists are two places in the sidebar and each keeps its own address.
   */
  kind = "staff",
}: {
  kind?: "staff" | "resident";
} = {}) {
  const { user, refresh } = useAuth();
  const [rows, setRows] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /* Both totals, so this page can point at the other register rather than
     leaving somebody to click the sidebar to find out if it is empty. */
  const [counts, setCounts] = useState<{ staff: number; resident: number }>();

  /*
   * Your own account, which is no longer in the list below.
   *
   * Taking the row away removes the accidental Deactivate — and would also
   * have left the administrator with nowhere at all to correct their own name
   * or email, since no other screen reaches `auth/profile`. This is that
   * screen. It has no Deactivate and no Delete, which is the whole point.
   */
  const [selfOpen, setSelfOpen] = useState(false);
  const [selfName, setSelfName] = useState("");
  const [selfEmail, setSelfEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [selfPassword, setSelfPassword] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  /* The account being corrected. Null is the create form. */
  const [editing, setEditing] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Clerk");

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
      .get("/admin/users", { params: { page, kind, search: search || undefined } })
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
  }, [page, search, kind]);

  // Live updates without a manual refresh.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("users", () => load(true));

  const openSelf = () => {
    setSelfName(user?.name ?? "");
    setSelfEmail(user?.email ?? "");
    setCurrentPassword("");
    setSelfPassword("");
    setSelfOpen(true);
  };

  const saveSelf = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await api.put("/auth/profile", { name: selfName, email: selfEmail });

      /*
       * The password is a separate call because it asks for the current one.
       * Changing your OWN password without proving you know it would make a
       * borrowed unlocked screen enough to take the account.
       */
      if (selfPassword) {
        await api.post("/auth/change-password", {
          current_password: currentPassword,
          new_password: selfPassword,
          new_password_confirmation: selfPassword,
        });
      }

      toast("Your account has been updated.");
      setSelfOpen(false);
      setCurrentPassword("");
      setSelfPassword("");
      await refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const startEdit = (user: User) => {
    setEditing(user);
    setName(user.name);
    setEmail(user.email);
    /* Blank means "leave it alone" — see the note on the field itself. */
    setPassword("");
    setRole(user.role);
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;

    try {
      await api.put(`/admin/users/${editing.id}`, {
        name,
        email,
        /* Only sent when something was typed. An empty string here would set
           the password to an empty string, which is a door. */
        ...(password ? { password } : {}),
        /* A resident account keeps its role: changing it would turn somebody
           on the register into a staff member without any office deciding so. */
        ...(editing.role === "Resident"
          ? {}
          : { role, office: ROLE_OFFICE[role] }),
      });

      toast(`${name} updated.`);
      setEditing(null);
      setPassword("");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Save this staff account?", confirmText: "Yes, save" }))) return;
    try {
      await api.post("/admin/users", {
        name,
        email,
        password,
        role,
        office: ROLE_OFFICE[role],
      });
      setCreateOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      toast("Staff account created.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  /**
   * Delete, which the server may refuse.
   *
   * Five kinds of record hold a staff account in place — an ordinance filed,
   * a health visit, an immunisation, a VAWC document, a follow-up. The server
   * checks and answers in a sentence; this only has to show it.
   */
  const remove = async (user: User) => {
    if (
      !(await confirmAction({
        title: `Delete ${user.name}?`,
        text: "Their account and sign-in are removed for good. If they have filed anything, the system will refuse and you should deactivate instead.",
        confirmText: "Yes, delete",
        cancelText: "Cancel",
      }))
    )
      return;

    try {
      await api.delete(`/admin/users/${user.id}`);
      toast(`${user.name} deleted.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const toggle = async (user: User) => {
    try {
      await api.put(`/admin/users/${user.id}`, { is_active: !user.is_active });
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title={kind === "staff" ? "Staff User Accounts" : "Resident Portal Accounts"}
        subtitle={
          kind === "staff"
            ? "Create and manage office staff accounts."
            : "Portal accounts for residents. New ones are issued by the Population Office when a resident is registered; they can be corrected, disabled or removed here."
        }
        /* Only the staff register makes accounts. A resident's is issued by
           the Population Office at the moment they are registered. */
        actions={
          kind === "staff" ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" /> New staff account
            </button>
          ) : undefined
        }
      />

      {/*
        Your own account, on the staff register only.

        It is not in the list any more, and there is nowhere else in the
        system that reaches it — so it sits here, with the two destructive
        buttons deliberately absent.
      */}
      {kind === "staff" && user && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-dark">
                {user.name} <span className="font-normal text-gray-400">· you</span>
              </p>
              <p className="truncate text-xs text-gray-500">
                {user.email} · {user.role}
              </p>
            </div>
            <button
              type="button"
              onClick={openSelf}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              <FiEdit2 className="h-4 w-4" aria-hidden="true" /> Edit my account
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-4">
          {counts && (
            <p className="w-full text-xs text-gray-500">
              {kind === "staff" ? (
                <>
                  <span className="font-semibold text-dark">{counts.staff}</span> staff
                  account{counts.staff === 1 ? "" : "s"} · {counts.resident} resident
                  account{counts.resident === 1 ? "" : "s"} are in{" "}
                  <Link to="/admin/residents" className="font-semibold text-primary hover:underline">
                    Resident Accounts
                  </Link>
                  .
                </>
              ) : (
                <>
                  <span className="font-semibold text-dark">{counts.resident}</span> resident
                  account{counts.resident === 1 ? "" : "s"} · {counts.staff} staff
                  account{counts.staff === 1 ? "" : "s"} are in{" "}
                  <Link to="/admin/users" className="font-semibold text-primary hover:underline">
                    Staff Accounts
                  </Link>
                  .
                </>
              )}
            </p>
          )}

          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            label="Search users"
            className="max-w-sm flex-1"
          />
        </div>

        <DataTable
          columns={[
            { header: "Name", render: (u: User) => <span className="font-medium text-dark">{u.name}</span> },
            { header: "Email", render: (u: User) => u.email },
            { header: "Role", render: (u: User) => u.role },
            { header: "Office", render: (u: User) => u.office },
            {
              header: "Status",
              render: (u: User) =>
                u.is_active ? (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Active</span>
                ) : (
                  <span className="rounded-full bg-gray px-2.5 py-1 text-xs font-semibold text-gray-500">Inactive</span>
                ),
            },
            {
              header: "",
              /*
                One column of round icon buttons, the same shape every other
                register in the system uses. Three text pills in three columns
                were written for this page alone.
              */
              render: (u: User) => (
                <RowActions>
                  <RowAction
                    label="Edit this account"
                    icon={FiEdit2}
                    tone="primary"
                    onClick={() => startEdit(u)}
                  />
                  <RowAction
                    label={u.is_active ? "Deactivate this account" : "Activate this account"}
                    icon={u.is_active ? FiUserX : FiUserCheck}
                    tone={u.is_active ? "danger" : "default"}
                    onClick={() => toggle(u)}
                  />
                  <RowAction
                    label="Delete this account for good"
                    icon={FiTrash2}
                    tone="danger"
                    onClick={() => remove(u)}
                  />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(u) => u.id}
          numbered
          total={total}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Staff Account">
        <form onSubmit={create} className="space-y-4">
          <FormField label="Full name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Temporary password" required hint="At least 8 characters">
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={inputClasses} />
          </FormField>
          <FormField label="Role" required hint={`Office: ${ROLE_OFFICE[role]}`}>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClasses}>
              {Object.keys(ROLE_OFFICE).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </FormField>
          <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Create account
          </button>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit account"}
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <FormField label="Full name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>

          <FormField label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>

          {/*
            Blank leaves it alone.

            The alternative — showing a box that looks empty because passwords
            cannot be read back — invites somebody to save the form and wipe
            the password without meaning to.
          */}
          <FormField
            label="New password"
            hint="Leave blank to keep their current one"
          >
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="off"
              className={inputClasses}
            />
          </FormField>

          {editing?.role === "Resident" ? (
            /*
             * A resident's role is not editable here. Turning somebody on the
             * register into a staff member is a decision an office makes, not
             * a dropdown on a correction form.
             */
            <div className="rounded-xl border border-gray bg-secondary/60 px-4 py-3 text-sm leading-relaxed text-gray-600">
              This is a resident&apos;s portal account. Their name, email and
              password can be corrected here; making somebody staff is done by
              creating a staff account for them.
            </div>
          ) : (
            <FormField label="Role" required hint={`Office: ${ROLE_OFFICE[role] ?? "—"}`}>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={inputClasses}
              >
                {Object.keys(ROLE_OFFICE).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </FormField>
          )}

          <div className="flex justify-end gap-3 border-t border-gray pt-4">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition hover:border-primary/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Save changes
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={selfOpen} onClose={() => setSelfOpen(false)} title="My account">
        <form onSubmit={saveSelf} className="space-y-4">
          <FormField label="Full name" required>
            <input
              value={selfName}
              onChange={(e) => setSelfName(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>

          <FormField label="Email" required hint="This is where a password reset code would go">
            <input
              type="email"
              value={selfEmail}
              onChange={(e) => setSelfEmail(e.target.value)}
              required
              className={inputClasses}
            />
          </FormField>

          <div className="rounded-xl border border-gray bg-secondary/60 px-4 py-3">
            <p className="mb-3 text-sm font-semibold text-dark">Change my password</p>

            <div className="space-y-3">
              <FormField label="Current password">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputClasses}
                />
              </FormField>

              <FormField label="New password" hint="Leave both blank to keep the one you have">
                <input
                  type="password"
                  value={selfPassword}
                  onChange={(e) => setSelfPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  className={inputClasses}
                />
              </FormField>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray pt-4">
            <button
              type="button"
              onClick={() => setSelfOpen(false)}
              className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition hover:border-primary/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(selfPassword) && !currentPassword}
              className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
