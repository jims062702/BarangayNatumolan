import { useEffect, useState } from "react";
import { FiCalendar, FiMapPin } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import PageHeader from "../../components/UI/PageHeader";
import type { Announcement } from "../../types";

const CATEGORY_TONES: Record<string, string> = {
  News: "bg-primary/10 text-primary",
  Advisory: "bg-warning/10 text-warning",
  Event: "bg-success/10 text-success",
  Health: "bg-danger/10 text-danger",
  Youth: "bg-primary/10 text-primary",
};

export default function PortalAnnouncements() {
  const [rows, setRows] = useState<Announcement[]>([]);

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.portal);

  useEffect(() => {
    api.get("/announcements").then((r) => setRows(r.data.data.data ?? [])).catch(() => undefined);
  }, [tick]);

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Official news and advisories from the barangay"
      />

      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="rounded-2xl border border-gray bg-white py-10 text-center text-sm text-gray-400">
            No announcements right now.
          </p>
        )}
        {rows.map((announcement) => (
          <article key={announcement.id} className="rounded-2xl border border-gray bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  CATEGORY_TONES[announcement.category] ?? "bg-gray text-gray-500"
                }`}
              >
                {announcement.category}
              </span>
              {announcement.published_at && (
                <span className="text-xs text-gray-400">
                  {new Date(announcement.published_at).toLocaleDateString("en-PH", { dateStyle: "long" })}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-lg font-bold text-dark">{announcement.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{announcement.body}</p>
            {(announcement.event_at || announcement.location) && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                {announcement.event_at && (
                  <span className="inline-flex items-center gap-1.5">
                    <FiCalendar className="text-primary" aria-hidden="true" />
                    {new Date(announcement.event_at).toLocaleString("en-PH", {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </span>
                )}
                {announcement.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <FiMapPin className="text-primary" aria-hidden="true" />
                    {announcement.location}
                  </span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
