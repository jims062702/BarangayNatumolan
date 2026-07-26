import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import Breadcrumbs from "../../components/UI/Breadcrumbs";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { Resident } from "../../types";

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

/** Default portal password: Lastname + MMDDYY of birthdate (e.g. Cruz062702). */
function defaultPortalPassword(lastName: string, birthdate?: string | null): string {
  if (!birthdate) return "";
  const [y, m, d] = birthdate.slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${lastName}${m}${d}${y.slice(2)}`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray/60 py-2.5 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-dark">{value || "—"}</span>
    </div>
  );
}

export default function ResidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resident, setResident] = useState<Resident | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sectorOpen, setSectorOpen] = useState(false);
  const [sectorType, setSectorType] = useState(SECTORS[0]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [passOpen, setPassOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const isBpo = user?.office === "Population" || user?.role === "Admin";
  const canEdit =
    ["Main Office", "Population"].includes(user?.office ?? "") ||
    ["Punong Barangay", "Admin"].includes(user?.role ?? "");

  const load = () => {
    api.get(`/residents/${id}`).then((r) => setResident(r.data.data)).catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addSector = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    try {
      await api.post(`/residents/${id}/sectors`, {
        sector_type: sectorType,
        enrolled_date: new Date().toISOString().slice(0, 10),
      });
      setSectorOpen(false);
      setFeedback(`Tagged as ${sectorType}.`);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  // Open the create-account modal with the email + default password pre-filled.
  const openCreateAccount = () => {
    if (!resident) return;
    setAccountEmail(resident.email ?? "");
    setAccountPassword(defaultPortalPassword(resident.last_name, resident.birthdate));
    setAccountOpen(true);
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !(await confirmAction({
        title: "Create a portal account?",
        text: `A login will be issued for ${accountEmail}.`,
        confirmText: "Yes, create account",
      }))
    )
      return;
    setFeedback("");
    try {
      await api.post(`/population/residents/${id}/create-account`, {
        email: accountEmail,
        password: accountPassword,
      });
      setAccountOpen(false);
      setFeedback(`Portal account created for ${accountEmail}. Share the credentials securely.`);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  // Open the change-password modal with the default password pre-filled.
  const openChangePassword = () => {
    if (!resident) return;
    setNewPassword(defaultPortalPassword(resident.last_name, resident.birthdate));
    setPassOpen(true);
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !(await confirmAction({
        title: "Change this account's password?",
        confirmText: "Yes, change",
      }))
    )
      return;
    setFeedback("");
    try {
      await api.post(`/population/residents/${id}/change-password`, { password: newPassword });
      setPassOpen(false);
      setFeedback("Portal account password updated. Share the new password securely.");
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  if (!resident) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading resident…</p>;
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Dashboard", to: "/dashboard" },
          { label: "Residents", to: "/residents" },
          { label: `${resident.first_name} ${resident.last_name}` },
        ]}
      />
      <PageHeader
        title={`${resident.first_name} ${resident.last_name}`}
        subtitle={`Resident No. ${resident.resident_number}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/residents")}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
            >
              <FiArrowLeft aria-hidden="true" /> Back
            </button>
            {canEdit && (
              <Link
                to={`/residents/${id}/edit`}
                className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Edit information
              </Link>
            )}
            {isBpo &&
              (resident.account ? (
                // Already has an account — only a password change is offered.
                <button
                  type="button"
                  onClick={openChangePassword}
                  className="cursor-pointer rounded-full border border-primary/40 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                >
                  Change password
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openCreateAccount}
                  className="cursor-pointer rounded-full border border-primary/40 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                >
                  Create portal account
                </button>
              ))}
          </div>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Personal information">
          <Row label="Full name" value={`${resident.first_name} ${resident.middle_name ?? ""} ${resident.last_name} ${resident.suffix ?? ""}`.replace(/\s+/g, " ")} />
          <Row label="Gender" value={resident.gender} />
          <Row label="Birthdate" value={resident.birthdate ? new Date(resident.birthdate).toLocaleDateString("en-PH", { dateStyle: "long" }) : null} />
          <Row label="Civil status" value={resident.civil_status} />
          <Row label="Occupation" value={resident.occupation} />
          <Row label="Contact" value={resident.contact_number} />
          <Row label="Email" value={resident.email} />
        </Card>

        <Card title="Residency & household">
          <Row label="Zone / Purok" value={resident.zone_purok} />
          <Row label="Residency status" value={resident.residency_status} />
          <Row label="Household" value={resident.household?.household_number} />
          <Row label="Address" value={resident.household?.street_address} />
          <Row label="Classification" value={resident.demographic_classification} />
        </Card>

        <Card
          title="Sector master lists"
          action={
            <button
              type="button"
              onClick={() => setSectorOpen(true)}
              className="cursor-pointer text-sm font-medium text-primary hover:underline"
            >
              + Tag sector
            </button>
          }
        >
          {(resident.sectors ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Not in any sector list.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {resident.sectors?.map((sector) => (
                <span key={sector.id} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  {sector.sector_type}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Service request history">
          {(resident.service_requests ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No requests on record.</p>
          ) : (
            <ul className="divide-y divide-gray/70">
              {resident.service_requests?.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-dark">{request.service_type}</p>
                    <p className="text-xs text-gray-500">{request.request_number}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Certificates issued">
          {(resident.certificates ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No certificates on record.</p>
          ) : (
            <ul className="divide-y divide-gray/70">
              {resident.certificates?.map((certificate) => (
                <li key={certificate.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-dark">{certificate.certificate_type}</p>
                    <p className="font-mono text-xs text-gray-500">{certificate.reference_number}</p>
                  </div>
                  <StatusBadge status={certificate.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={sectorOpen} onClose={() => setSectorOpen(false)} title="Tag sector membership">
        <form onSubmit={addSector} className="space-y-4">
          <FormField label="Sector" required>
            <select value={sectorType} onChange={(e) => setSectorType(e.target.value)} className={inputClasses}>
              {SECTORS.map((sector) => (
                <option key={sector}>{sector}</option>
              ))}
            </select>
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Add to master list
          </button>
        </form>
      </Modal>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="Create resident portal account">
        <p className="mb-4 rounded-xl bg-warning/10 px-4 py-2.5 text-xs text-dark">
          Only the Population Office issues portal accounts, after verifying the
          person resides in Barangay Natumolan.
        </p>
        <form onSubmit={createAccount} className="space-y-4">
          <FormField
            label="Login email"
            required
            hint={
              resident.email
                ? "Auto-filled from the resident's record."
                : "This resident has no email on file — enter one to proceed (it will be saved)."
            }
          >
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              required
              className={inputClasses}
              placeholder="resident@email.com"
            />
          </FormField>
          <FormField
            label="Temporary password"
            required
            hint="Auto-set to Lastname + birthday (MMDDYY), e.g. Cruz062702. The resident should change it after first login."
          >
            <input
              type="text"
              value={accountPassword}
              onChange={(e) => setAccountPassword(e.target.value)}
              required
              minLength={6}
              className={inputClasses}
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Create account
          </button>
        </form>
      </Modal>

      <Modal open={passOpen} onClose={() => setPassOpen(false)} title="Change portal password">
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-xs text-dark">
          Account: <strong>{resident.account?.email}</strong>. Set a new password
          and share it with the resident securely.
        </p>
        <form onSubmit={changePassword} className="space-y-4">
          <FormField
            label="New password"
            required
            hint="Defaults to Lastname + birthday (MMDDYY), e.g. Cruz062702."
          >
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className={inputClasses}
            />
          </FormField>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Update password
          </button>
        </form>
      </Modal>
    </div>
  );
}
