import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import type { Certificate } from "../../types";

export default function PortalCertificates() {
  const [rows, setRows] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.portal);

  useEffect(() => {
    setLoading(true);
    api
      .get("/portal/certificates", { params: { page } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  }, [page, tick]);

  return (
    <div>
      <PageHeader
        title="My Certificates"
        subtitle="Certificates issued to you, with their public verification references"
      />

      <Card>
        <DataTable
          columns={[
            {
              header: "Certificate #",
              render: (c: Certificate) => <span className="font-medium text-dark">{c.certificate_number}</span>,
            },
            { header: "Type", render: (c: Certificate) => c.certificate_type },
            { header: "Purpose", render: (c: Certificate) => c.purpose ?? "—" },
            { header: "Status", render: (c: Certificate) => <StatusBadge status={c.status} /> },
            {
              header: "Verification Ref.",
              render: (c: Certificate) => (
                <a
                  href={`/verify`}
                  className="font-mono text-xs text-primary hover:underline"
                  title="Open the public verification page"
                >
                  {c.reference_number}
                </a>
              ),
            },
            {
              header: "Released",
              render: (c: Certificate) =>
                c.released_at ? new Date(c.released_at).toLocaleDateString("en-PH") : "—",
            },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          loading={loading}
          emptyMessage="No certificates issued yet."
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
