import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiClock, FiMapPin, FiUser } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import PageHeader from "../../components/UI/PageHeader";
import { KIND, POST_KINDS, URGENCY_TONE, badgeFor, kindOf, postDate, whenOf, type PostKind } from "../../lib/postKinds";
import type { Announcement } from "../../types";

export default function PortalAnnouncements() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [upcoming, setUpcoming] = useState<Announcement[]>([]);
  const [kind, setKind] = useState<"" | PostKind>("");

  // Live updates: bump `tick` to re-run the fetch below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.portal);

  useEffect(() => {
    api
      .get("/announcements", { params: kind ? { category: kind } : {} })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setUpcoming(r.data.data.upcoming ?? []);
      })
      .catch(() => undefined);
  }, [tick, kind]);

  return (
    <div>
      <PageHeader
        title="News & Announcements"
        subtitle="Announcements · Events · Activities · Advisories · Programs"
      />

      {/*
        What is still to come, first.

        The rest of this page is a record of what the barangay has said; this
        is the part that answers "what is happening next", which is the
        question most residents open it with.
      */}
      {upcoming.length > 0 && (
        <div className="mb-6 rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-dark">Coming up</h2>
          <ul className="divide-y divide-gray/70">
            {upcoming.slice(0, 4).map((event) => (
              <li key={event.id} className="flex items-center gap-4 py-3">
                <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <span className="text-[10px] font-bold uppercase">
                    {postDate(event.event_at).split(" ")[0]?.slice(0, 3)}
                  </span>
                  <span className="text-lg font-extrabold leading-none">
                    {event.event_at?.slice(8, 10)}
                  </span>
                </span>
                <span className="min-w-0">
                  <Link
                    to={`/news/${event.id}`}
                    className="block font-semibold text-dark hover:text-primary"
                  >
                    {event.title}
                  </Link>
                  <span className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                    {event.event_time && (
                      <span className="inline-flex items-center gap-1">
                        <FiClock aria-hidden="true" /> {event.event_time}
                      </span>
                    )}
                    {event.location && (
                      <span className="inline-flex items-center gap-1">
                        <FiMapPin aria-hidden="true" /> {event.location}
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ key: "" as const, label: "All" }, ...POST_KINDS.map((k) => ({ key: k, label: KIND[k].plural }))].map(
          (chip) => (
            <button
              key={chip.key || "all"}
              type="button"
              onClick={() => setKind(chip.key)}
              aria-pressed={kind === chip.key}
              className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                kind === chip.key ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {chip.label}
            </button>
          )
        )}
      </div>

      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="rounded-2xl border border-gray bg-white py-10 text-center text-sm text-gray-400">
            {kind ? `No ${KIND[kind].plural.toLowerCase()} right now.` : "No announcements right now."}
          </p>
        )}

        {rows.map((post) => {
          const postKind = kindOf(post.category);
          const isAdvisory = postKind === "Advisory";

          return (
            <article
              key={post.id}
              /* An advisory is the one kind that has to be noticed before the
                 reader has decided whether to read the page. */
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                isAdvisory ? "border-l-4 border-danger" : "border-gray"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND[postKind].tone}`}>
                  {badgeFor(post)}
                </span>
                {isAdvisory && post.urgency && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      URGENCY_TONE[post.urgency] ?? "bg-secondary text-gray-600"
                    }`}
                  >
                    <FiAlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {post.urgency}
                  </span>
                )}
                {whenOf(post) && <span className="text-xs text-gray-400">{whenOf(post)}</span>}
              </div>

              <h2 className="mt-2 text-lg font-bold text-dark">
                <Link to={`/news/${post.id}`} className="hover:text-primary">
                  {post.title}
                </Link>
              </h2>

              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                {post.excerpt || post.body}
              </p>

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                {post.event_time && (
                  <span className="inline-flex items-center gap-1.5">
                    <FiClock className="text-primary" aria-hidden="true" />
                    {post.event_time}
                  </span>
                )}
                {post.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <FiMapPin className="text-primary" aria-hidden="true" />
                    {post.location}
                  </span>
                )}
                {post.registration_deadline && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                    <FiCalendar aria-hidden="true" />
                    Register by {postDate(post.registration_deadline)}
                  </span>
                )}
                {(post.byline || post.author_name) && (
                  <span className="inline-flex items-center gap-1.5">
                    <FiUser className="text-primary" aria-hidden="true" />
                    By {post.byline || post.author_name}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
