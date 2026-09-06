import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {  FiArrowLeft, FiX, FiPlus , FiEdit2 } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { personName } from "../../lib/names";
import { confirmAction } from "../../lib/confirm";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import FamilyPanel, { memberName } from "../../components/FamilyPanel";
import AddRelativeModal, { type Relation } from "../../components/AddRelativeModal";
import MergeDuplicates from "../../components/MergeDuplicates";
import MarriageHistory from "../../components/MarriageHistory";
import ConvertToResident from "../../components/ConvertToResident";
import EndGuardianshipModal from "../../components/EndGuardianshipModal";
import LifeStatusEditor from "../../components/LifeStatusEditor";
import { MANUAL_SECTORS, isAgeSector } from "../../lib/sectors";
import type { FamilyMember, Resident } from "../../types";

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
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [resident, setResident] = useState<Resident | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sectorOpen, setSectorOpen] = useState(false);
  const [sectorType, setSectorType] = useState(MANUAL_SECTORS[0]);
  /*
   * The card behind a tag. Solo Parent is a registration under RA 8972, not
   * something the office concludes from looking at a household — so the ID
   * number is asked for, and the server refuses the tag without it.
   */
  const [sectorRef, setSectorRef] = useState("");
  const [sectorIssued, setSectorIssued] = useState("");
  const [sectorValidUntil, setSectorValidUntil] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [passOpen, setPassOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  // Which of Add parent / Add child / Add spouse is open, if any.
  const [relation, setRelation] = useState<Relation | null>(null);
  /*
   * The guardian whose arrangement is being ended. Ending is not unlinking:
   * the parents coming home is a fact about the child's life and the row
   * stays, while a carer recorded against the wrong child is a mistake and
   * goes. Two buttons, because only the clerk knows which one it is.
   */
  const [endingGuardian, setEndingGuardian] = useState<FamilyMember | null>(null);

  const isBpo = user?.office === "Population" || user?.role === "Admin";
  const canEdit =
    ["Main Office", "Population"].includes(user?.office ?? "") ||
    ["Punong Barangay", "Admin"].includes(user?.role ?? "");

  /*
   * Puts the address right once the record says what it is.
   *
   * A non-resident reached from a family panel or a search lands on
   * /residents/911, where the sidebar can only conclude "Residents" —
   * the URL carries no way to know otherwise, and neither does anything
   * else reading it. Replacing rather than pushing keeps the correction
   * out of the back button.
   */
  useEffect(() => {
    if (!resident || !id) return;

    const belongs = resident.record_type === "Non-resident"
      ? `/residents/non-residents/${id}`
      : `/residents/${id}`;

    if (pathname !== belongs) {
      navigate(belongs, { replace: true });
    }
  }, [resident, id, pathname, navigate]);

  const load = () => {
    api
      .get(`/residents/${id}`)
      .then((r) => {
        setResident(r.data.data);
        setLoadError("");
      })
      // Swallowing this was hiding a broken page behind stale data: the
      // previous resident stayed on screen as though it were the new one.
      .catch((err) => setLoadError(errorMessage(err)));
  };

  useEffect(() => {
    /*
     * Clear FIRST. The family panel links to other profiles, which is the
     * same route with a different id — React re-renders rather than
     * remounting, so without this the previous person's record (and their
     * family) stays on screen until the fetch lands. Clicking your way from a
     * parent to their child therefore showed the PARENT's family under the
     * child's name, which reads exactly like "the link did not save".
     */
    setResident(null);
    setLoadError("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addSector = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.post(`/residents/${id}/sectors`, {
        sector_type: sectorType,
        enrolled_date: new Date().toISOString().slice(0, 10),
        reference_no: sectorRef || undefined,
        issued_on: sectorIssued || undefined,
        valid_until: sectorValidUntil || undefined,
      });
      setSectorOpen(false);
      setSectorRef("");
      setSectorIssued("");
      setSectorValidUntil("");
      toast(`Tagged as ${sectorType}.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeSector = async (sectorId: number, label: string) => {
    if (
      !(await confirmAction({
        title: `Remove "${label}"?`,
        text: "This sector tag will be removed from the resident.",
        confirmText: "Yes, remove",
        danger: true,
      }))
    )
      return;
    try {
      await api.delete(`/residents/${id}/sectors/${sectorId}`);
      toast(`Removed ${label}.`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  /** Removes a family link recorded in error. The person stays registered. */
  const unlinkRelative = async (member: FamilyMember, kind: Relation) => {
    if (
      !(await confirmAction({
        title: `Remove ${memberName(member)} as ${kind}?`,
        text: "Only the family link is removed — their resident record is kept.",
        confirmText: "Yes, remove the link",
        danger: true,
      }))
    )
      return;
    try {
      await api.delete(`/residents/${id}/family/${member.id}`, { params: { relation: kind } });
      toast("Family link removed.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  /**
   * Issues a portal account for a record that predates automatic accounts, or
   * whose email was missing at registration. New registrations never need this.
   */
  const issueAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !(await confirmAction({
        title: "Issue a portal account?",
        text: `A login will be created for ${accountEmail} and emailed to them.`,
        confirmText: "Yes, issue it",
      }))
    )
      return;
    try {
      const response = await api.post(`/population/residents/${id}/create-account`, {
        email: accountEmail || undefined,
      });
      setAccountOpen(false);
      toast(
        `${response.data.message} Temporary password: ${response.data.data.password}`
      );
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  /** "I never got the email" — sends a fresh activation code. */
  const resendActivation = async () => {
    if (!resident?.account) return;
    try {
      const response = await api.post(
        `/population/accounts/${resident.account.id}/resend-activation`
      );
      toast(response.data.message);
    } catch (err) {
      toast(errorMessage(err), "error");
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
    try {
      await api.post(`/population/residents/${id}/change-password`, { password: newPassword });
      setPassOpen(false);
      toast("Portal account password updated. Share the new password securely.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (loadError) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium text-danger">{loadError}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 cursor-pointer rounded-full border border-gray px-5 py-2 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!resident) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading resident…</p>;
  }

  const account = resident.account ?? null;
  const activated = !!account?.activated_at;
  // A relative who lives elsewhere: on the register so the family can be
  // recorded, but not a constituent.
  const isOutside = resident.record_type === "Non-resident";
  const isDeceased = resident.life_status === "Deceased";
  // Where this record belongs. See the routes in App.tsx.
  const home = isOutside ? "/residents/non-residents" : "/residents";

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Dashboard", to: "/dashboard" },
          // Back to the list they were actually browsing. Sending somebody
          // from a non-resident to the resident registry is a dead end: the
          // record they just left is not in it.
          {
            label: isOutside ? "Non-residents" : "Residents",
            to: home,
          },
          { label: `${resident.first_name} ${resident.last_name}` },
        ]}
        title={`${resident.first_name} ${resident.last_name}`}
        subtitle={
          isOutside
            ? `${resident.resident_number} · Lives outside the barangay${
                resident.address ? ` — ${resident.address}` : ""
              }`
            : `Resident No. ${resident.resident_number}`
        }
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
                to={`${home}/${id}/edit`}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                <FiEdit2 className="h-4 w-4" aria-hidden="true" /> Edit information
              </Link>
            )}
          </div>
        }
      />

      {isDeceased && (
        <p className="mb-6 rounded-2xl bg-dark/5 px-4 py-3 text-sm font-medium text-dark">
          Recorded as <strong>deceased</strong>
          {resident.date_of_death && (
            <> on {new Date(resident.date_of_death).toLocaleDateString("en-PH", { dateStyle: "long" })}</>
          )}
          . Their family links are kept.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Personal information">
          <Row label="Full name" value={personName(resident)} />
          <Row label="Gender" value={resident.gender} />
          <Row label="Birthdate" value={resident.birthdate ? new Date(resident.birthdate).toLocaleDateString("en-PH", { dateStyle: "long" }) : null} />
          <Row label="Place of birth" value={resident.birth_place} />
          <Row label="Civil status" value={resident.civil_status} />
          <Row label="Occupation" value={resident.occupation} />
          <Row label="Educational attainment" value={resident.educational_attainment} />
          <Row label="Contact" value={resident.contact_number} />
          <Row label="Email" value={resident.email} />
        </Card>

        {/*
          A non-resident holds none of this. "Residency status: Permanent"
          beside somebody living in Cagayan de Oro is not an empty field — it
          is the NOT NULL column default being read as a fact, under a heading
          that does not apply to them at all. What IS true of them is one
          line: where they live.
        */}
        {isOutside ? (
          <Card title="Where they live">
            <Row label="Address" value={resident.address} />
            <p className="mt-4 rounded-xl bg-secondary/70 px-4 py-3 text-xs leading-relaxed text-gray-600">
              This person lives <strong>outside Barangay Natumolan</strong>. They hold no
              household, purok, residency status or sector, are not counted in the population,
              and no barangay certificate can be issued to them. If they have moved in, use{" "}
              <strong>Convert to resident</strong> below &mdash; every family link comes with
              them and they are given a resident number.
            </p>
          </Card>
        ) : (
          <Card title="Residency & household">
            <Row label="Zone / Purok" value={resident.zone_purok} />
            <Row label="Residency status" value={resident.residency_status} />
            <Row
              label="Length of residence"
              value={
                resident.length_of_residence_years != null
                  ? `${resident.length_of_residence_years} year${resident.length_of_residence_years === 1 ? "" : "s"}`
                  : null
              }
            />
            <Row label="Household" value={resident.household?.household_number} />
            <Row label="Address" value={resident.household?.street_address} />
          </Card>
        )}

        <Card
          title="Classification & Sectors"
          action={
            isBpo ? (
              <button
                type="button"
                onClick={() => setSectorOpen(true)}
                className="cursor-pointer text-sm font-medium text-primary hover:underline"
              >
                <FiPlus className="h-4 w-4" aria-hidden="true" /> Add sector
              </button>
            ) : undefined
          }
        >
          {(resident.sectors ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Not in any sector list.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {resident.sectors?.map((sector) => (
                <span
                  key={sector.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                >
                  {sector.sector_type}
                  {/* Age brackets are auto-managed → no manual remove. */}
                  {isBpo && !isAgeSector(sector.sector_type) && (
                    <button
                      type="button"
                      onClick={() => removeSector(sector.id, sector.sector_type)}
                      aria-label={`Remove ${sector.sector_type}`}
                      title={`Remove ${sector.sector_type}`}
                      className="cursor-pointer rounded-full text-primary/60 transition-colors hover:text-danger"
                    >
                      <FiX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {isBpo && (
            <p className="mt-3 text-xs text-gray-400">
              Age brackets (Child, Youth, Adult, Senior Citizen) are set automatically from birthdate.
            </p>
          )}
        </Card>
      </div>

      {/* Duplicate warning first: a split record is normally noticed BECAUSE
          the family below looks wrong, so the explanation goes above it. */}
      {isBpo && (
        <div className="mt-6">
          <MergeDuplicates resident={resident} onMerged={load} />
        </div>
      )}

      {/* Family — parents, spouse, children, and the grandparents those imply */}
      <div className="mt-6">
        <FamilyPanel
          family={{
            parents: resident.parents ?? [],
            grandparents: resident.grandparents ?? [],
            spouse: resident.spouse ?? null,
            children: resident.children ?? [],
            siblings: resident.siblings ?? [],
            aunts_uncles: resident.aunts_uncles ?? [],
            cousins: resident.cousins ?? [],
            guardians: resident.guardians ?? [],
            wards: resident.wards ?? [],
            past_guardians: resident.past_guardians ?? [],
            care_note: resident.care_note ?? null,
            parents_note: resident.parents_note ?? null,
          }}
          linkTo={(member) => `/residents/${member.id}`}
          onAdd={isBpo ? setRelation : undefined}
          onRemove={isBpo ? unlinkRelative : undefined}
          onEndGuardianship={isBpo ? setEndingGuardian : undefined}
        />
      </div>

      {isBpo && (
        <div className="mt-6">
          <MarriageHistory resident={resident} onChanged={load} />
        </div>
      )}

      {/* Self-hides for anyone who already lives here. */}
      {isBpo && (
        <div className="mt-6">
          <ConvertToResident resident={resident} onConverted={load} />
        </div>
      )}

      {isBpo && (
        <div className="mt-6">
          <LifeStatusEditor resident={resident} onChanged={load} />
        </div>
      )}

      {/* Portal account — created automatically at registration, so this is a
          status panel with a repair button, not a form. */}
      {isBpo && !isOutside && !isDeceased && (
        <div className="mt-6">
          <Card title="Resident portal account">
            {account ? (
              <div className="space-y-3">
                <Row label="Login email" value={account.email} />
                <Row label="Sign-in enabled" value={account.is_active ? "Yes" : "No — disabled by this office"} />
                <Row
                  label="Email verified"
                  value={
                    activated
                      ? `Yes — activated ${new Date(account.activated_at!).toLocaleDateString("en-PH")}`
                      : "Not yet — waiting for them to enter the emailed code"
                  }
                />
                {!activated && (
                  <p className="rounded-xl bg-warning/10 px-4 py-2.5 text-xs leading-relaxed text-dark">
                    They have not signed in yet. Their password is{" "}
                    <strong>{defaultPortalPassword(resident.last_name, resident.birthdate) || "their last name + birthday (MMDDYY)"}</strong>
                    , and a 6-digit code is emailed to them the first time they try.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={openChangePassword}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary/40 px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    Change password
                  </button>
                  {!activated && (
                    <button
                      type="button"
                      onClick={resendActivation}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray px-5 py-2 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                    >
                      Resend activation code
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="rounded-xl bg-warning/10 px-4 py-2.5 text-sm leading-relaxed text-dark">
                  No portal account. Accounts are created automatically when a resident is
                  registered — this record either predates that, or had no email address on file.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAccountEmail(resident.email ?? "");
                    setAccountOpen(true);
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  Issue portal account
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

      {!isOutside && (
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
      )}

      <EndGuardianshipModal
        guardian={endingGuardian}
        residentId={resident.id}
        wardName={resident.first_name}
        onClose={() => setEndingGuardian(null)}
        onEnded={(message) => {
          toast(message);
          load();
        }}
      />

      {relation && (
        <AddRelativeModal
          open={relation !== null}
          relation={relation}
          resident={resident}
          onClose={() => setRelation(null)}
          onSaved={(message) => {
            toast(message);
            load();
          }}
        />
      )}

      <Modal open={sectorOpen} onClose={() => setSectorOpen(false)} title="Tag sector membership">
        <form onSubmit={addSector} className="space-y-4">
          <FormField label="Sector" required hint="Age brackets (Child, Youth, Adult, Senior) are set automatically from birthdate.">
            <select value={sectorType} onChange={(e) => setSectorType(e.target.value)} className={inputClasses}>
              {MANUAL_SECTORS.map((sector) => (
                <option key={sector}>{sector}</option>
              ))}
            </select>
          </FormField>

          {/*
            Solo Parent is a status granted on registration and carrying
            benefits, so the tag follows the ID rather than the other way
            round — and somebody with a partner on the record is not raising
            children alone, which the server refuses outright.
          */}
          {sectorType === "Solo Parent" && (
            <>
              <p className="rounded-xl bg-secondary/70 px-4 py-3 text-xs leading-relaxed text-gray-600">
                Solo Parent is a registration under <strong>RA 8972</strong>, not a judgement made
                at this desk. Record the number from their Solo Parent ID.
                {resident.spouse && (
                  <>
                    {" "}
                    <span className="font-semibold text-warning">
                      {resident.first_name} is recorded as partnered with{" "}
                      {resident.spouse.first_name} {resident.spouse.last_name} — end that union on
                      their record first, with the reason, or this will be refused.
                    </span>
                  </>
                )}
              </p>

              <FormField label="Solo Parent ID / reference no." required>
                <input
                  value={sectorRef}
                  onChange={(e) => setSectorRef(e.target.value)}
                  required
                  className={inputClasses}
                  placeholder="e.g. SP-2026-00113"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Issued on">
                  <input
                    type="date"
                    value={sectorIssued}
                    onChange={(e) => setSectorIssued(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className={inputClasses}
                  />
                </FormField>
                <FormField label="Valid until" hint="A Solo Parent ID runs for a year and is renewed.">
                  <input
                    type="date"
                    value={sectorValidUntil}
                    onChange={(e) => setSectorValidUntil(e.target.value)}
                    className={inputClasses}
                  />
                </FormField>
              </div>
            </>
          )}
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Add to master list
          </button>
        </form>
      </Modal>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="Issue resident portal account">
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-xs leading-relaxed text-dark">
          The password is set automatically to the resident's{" "}
          <strong>last name + birthday (MMDDYY)</strong> — e.g. Cruz062702 — and they activate the
          account themselves with a code emailed to this address.
        </p>
        <form onSubmit={issueAccount} className="space-y-4">
          <FormField
            label="Login email"
            required
            hint={
              resident.email
                ? "From the resident's record. Change it here to update the record too."
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
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Issue account &amp; email the details
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
