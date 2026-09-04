import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { personName } from "../../lib/names";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import FamilyPanel from "../../components/FamilyPanel";
import type { Family, User } from "../../types";

/**
 * "My Profile" — the resident's own record, and the family attached to it.
 *
 * The family used to be its own menu entry. It is the same question ("what
 * does the barangay have on me?"), so it lives here instead: one page, one
 * button in the sidebar.
 *
 * Everything is read-only. The Population Office owns the registry, so
 * corrections are made there; showing it here is what lets a resident notice
 * a mistake at all.
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

  useEffect(() => {
    api.get("/portal/profile").then((r) => setAccount(r.data.data)).catch(() => undefined);
    api
      .get("/portal/family")
      .then((r) => setFamily(r.data.data))
      .catch(() => setFamilyError("Your family record could not be loaded right now."));
  }, []);

  const resident = account?.resident;

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
          <Row label="Occupation" value={resident?.occupation} />
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
