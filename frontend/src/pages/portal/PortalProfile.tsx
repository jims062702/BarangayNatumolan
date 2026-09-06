import { useEffect, useState } from "react";
import { FiCheck, FiEdit2 } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { personName } from "../../lib/names";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import FamilyPanel from "../../components/FamilyPanel";
import { inputClasses } from "../../components/UI/FormField";
import type { Family, User } from "../../types";

/**
 * "My Profile" — the resident's own record, and the family attached to it.
 *
 * The family used to be its own menu entry. It is the same question ("what
 * does the barangay have on me?"), so it lives here instead: one page, one
 * button in the sidebar.
 *
 * Nearly everything is read-only. The Population Office owns the registry, so
 * corrections are made there; showing it here is what lets a resident notice
 * a mistake at all.
 *
 * Occupation is the exception, and it is the resident who owns that one:
 * nobody at the counter knows what work somebody does better than they do,
 * and an office typing a neighbour's occupation is guessing at the figure a
 * livelihood programme then gets planned around.
 */

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray/60 py-2.5 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-dark">{value || "—"}</span>
    </div>
  );
}

export default function PortalProfile() {
  const [account, setAccount] = useState<User | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [familyError, setFamilyError] = useState("");

  /* The occupation list comes with the profile — the page cannot draw its one
     editable field without it. */
  const [occupations, setOccupations] = useState<string[]>([]);
  const [editingJob, setEditingJob] = useState(false);
  const [job, setJob] = useState("");
  const [savingJob, setSavingJob] = useState(false);

  useEffect(() => {
    api
      .get("/portal/profile")
      .then((r) => {
        setAccount(r.data.data.user ?? null);
        setOccupations(r.data.data.occupations ?? []);
      })
      .catch(() => undefined);
    api
      .get("/portal/family")
      .then((r) => setFamily(r.data.data))
      .catch(() => setFamilyError("Your family record could not be loaded right now."));
  }, []);

  const resident = account?.resident;

  /*
   * What is already recorded, even when it is not on the list.
   *
   * Most of the register was filled in before there was a list — "Housewife",
   * "Fisherman", "Tricycle Driver". Offering only the list would blank those
   * the moment somebody opened the dropdown, so what they have is kept as a
   * choice of its own and said to be off the list.
   */
  const current = resident?.occupation ?? "";
  const offList = current !== "" && !occupations.includes(current);

  /*
   * "None" is shown as a dash.
   *
   * It is STORED as the word, because a dash in an exported column cannot be
   * told apart from an empty cell — and the two mean different things: one
   * says "no work", the other says nobody has asked yet.
   */
  const labelFor = (option: string) => (option === "None" ? "—" : option);

  const saveJob = async () => {
    setSavingJob(true);
    try {
      await api.put("/portal/profile/occupation", { occupation: job });
      setAccount((was) =>
        was?.resident ? { ...was, resident: { ...was.resident, occupation: job } } : was
      );
      setEditingJob(false);
      toast("Your occupation has been updated.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingJob(false);
    }
  };

  const noFamily =
    family !== null &&
    (family.parents?.length ?? 0) === 0 &&
    (family.children?.length ?? 0) === 0 &&
    (family.siblings?.length ?? 0) === 0 &&
    !family.spouse;

  return (
    <div>
      <PageHeader
        title="My Profile"
        subtitle="Your registered resident record and family. Visit the Population Office to correct any detail."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Resident information">
          <Row label="Resident No." value={resident?.resident_number} />
          <Row
            label="Full name"
            value={
              resident
                ? personName(resident)
                : undefined
            }
          />
          <Row label="Gender" value={resident?.gender} />
          <Row
            label="Birthdate"
            value={
              resident?.birthdate
                ? new Date(resident.birthdate).toLocaleDateString("en-PH", { dateStyle: "long" })
                : undefined
            }
          />
          <Row label="Civil status" value={resident?.civil_status} />
          {/*
            The one row on this page with a control on it.
          */}
          <div className="border-b border-gray/60 py-2.5 text-sm last:border-0">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500">Occupation</span>

              {editingJob ? null : (
                <span className="flex items-center gap-2">
                  <span className="text-right font-medium text-dark">
                    {resident?.occupation ? labelFor(resident.occupation) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setJob(offList ? "" : current);
                      setEditingJob(true);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    <FiEdit2 className="h-3 w-3" aria-hidden="true" />
                    Change
                  </button>
                </span>
              )}
            </div>

            {editingJob && (
              <div className="mt-2 space-y-2">
                <select
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  aria-label="Occupation"
                  className={inputClasses}
                >
                  <option value="">Choose your occupation…</option>
                  {/* What they already have, when the list does not hold it. */}
                  {offList && <option value={current}>{current} (already recorded)</option>}
                  {occupations.map((option) => (
                    <option key={option} value={option}>
                      {labelFor(option)}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingJob || job === "" || job === current}
                    onClick={saveJob}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                  >
                    <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {savingJob ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingJob(false)}
                    className="cursor-pointer rounded-full border border-gray px-4 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-primary hover:text-primary"
                  >
                    Cancel
                  </button>
                  <span className="text-xs text-gray-400">
                    Only you can change this. The office cannot.
                  </span>
                </div>
              </div>
            )}
          </div>
          <Row label="Contact number" value={resident?.contact_number} />
        </Card>

        <Card title="Residency & household">
          <Row label="Zone / Purok" value={resident?.zone_purok} />
          <Row label="Residency status" value={resident?.residency_status} />
          <Row label="Household No." value={resident?.household?.household_number} />
          <Row label="Household address" value={resident?.household?.street_address} />
          <Row label="Portal email" value={account?.email} />
        </Card>
      </div>

      <div className="mt-6">
        {familyError ? (
          <Card title="My family">
            <p className="py-6 text-center text-sm text-danger">{familyError}</p>
          </Card>
        ) : !family ? (
          <Card title="My family">
            <p className="py-6 text-center text-sm text-gray-400">Loading your family…</p>
          </Card>
        ) : noFamily ? (
          <Card title="My family">
            <p className="py-8 text-center text-sm leading-relaxed text-gray-500">
              No family members are linked to your record yet.
              <br />
              Visit the <strong>Barangay Population Office</strong> to have your parents, spouse or
              children added — your grandparents, siblings and cousins then appear on their own.
            </p>
          </Card>
        ) : (
          <>
            {/* Names only: a resident may see who their relatives are, not open
                their registry records. */}
            <FamilyPanel family={family} title="My family" />
            <p className="mt-4 rounded-2xl border border-gray bg-white px-4 py-3 text-xs leading-relaxed text-gray-500">
              Something wrong or missing? Visit the <strong>Barangay Population Office</strong> with
              a valid ID and they will correct it. Grandparents, siblings, tita/tito and pinsan are
              worked out from your parents&rsquo; records, so they fill in as more of the family is
              registered.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
