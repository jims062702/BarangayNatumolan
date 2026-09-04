import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { User } from "../../types";

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

export default function UserManagement() {
  const [rows, setRows] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Clerk");

  const load = () => {
    setLoading(true);
    api
      .get("/admin/users", { params: { page, search: search || undefined } })
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
        title="Staff User Accounts"
        subtitle="Create and manage office staff accounts. Resident portal accounts are handled by the Population Office."
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + New staff account
          </button>
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
            placeholder="Search name or email…"
            aria-label="Search users"
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
              render: (u: User) =>
                u.role !== "Resident" && (
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
    </div>
  );
}
