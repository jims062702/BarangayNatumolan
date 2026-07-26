import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import type { User } from "../../types";

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

  useEffect(() => {
    api.get("/portal/profile").then((r) => setAccount(r.data.data)).catch(() => undefined);
  }, []);

  const resident = account?.resident;

  return (
    <div>
      <PageHeader
        title="My Profile"
        subtitle="Your registered resident record. Visit the Population Office to correct any detail."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Resident information">
          <Row label="Resident No." value={resident?.resident_number} />
          <Row
            label="Full name"
            value={
              resident
                ? `${resident.first_name} ${resident.middle_name ?? ""} ${resident.last_name}`.replace(/\s+/g, " ")
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
    </div>
  );
}
