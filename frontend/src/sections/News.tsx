import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiCalendar, FiClock, FiMapPin, FiUser } from "react-icons/fi";
import { api } from "../lib/api";
import { readPublicCache, writePublicCache } from "../lib/publicContent";
import SectionTitle from "../components/SectionTitle/SectionTitle";
import Reveal from "../components/UI/Reveal";
import {
  KIND,
  POST_KINDS,
  URGENCY_TONE,
  badgeFor,
  kindOf,
  postDate,
  whenOf,
  type PostKind,
} from "../lib/postKinds";
import { news as samples } from "../data/news";
import type { Announcement } from "../types";

interface Payload {
  data: Announcement[];
  upcoming: Announcement[];
  counts: Record<string, number>;
}

/** The badge every card wears. Colour plus the word — never colour alone. */
function KindBadge({ post }: { post: Announcement }) {
  const kind = kindOf(post.category);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${KIND[kind].tone}`}
      >
        {badgeFor(post)}
      </span>
      {kind === "Advisory" && post.urgency && (
        <span
          className={`inline-block rounded-full px-2 py-1 text-[11px] font-bold ${
            URGENCY_TONE[post.urgency] ?? "bg-secondary text-gray-600"
          }`}
        >
          {post.urgency}
        </span>
      )}
    </span>
  );
}

/** The one or two facts that make a post actionable, under its title. */
function Facts({ post, className = "" }: { post: Announcement; className?: string }) {
  const kind = kindOf(post.category);
  const when = whenOf(post);

  const rows: { icon: typeof FiCalendar; text: string }[] = [];

  if (when) rows.push({ icon: FiCalendar, text: when });
  if (kind === "Event" && post.event_time) rows.push({ icon: FiClock, text: post.event_time });
  if (post.location) rows.push({ icon: FiMapPin, text: post.location });
  if (kind === "Advisory" && post.expires_at) {
    rows.push({ icon: FiClock, text: `Until ${postDate(post.expires_at)}` });
  }

  if (rows.length === 0) return null;

  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${className}`}>
      {rows.map((row, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <row.icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
          {row.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * The line a post is signed with.
 *
 * `byline` is what the office typed, or the account that posted it when they
 * typed nothing. A notice with no name on it reads as nobody's — a resident
 * cannot tell an official announcement from something that slipped through.
 */
function Byline({ post, className = "" }: { post: Announcement; className?: string }) {
  const name = post.byline || post.author_name;
  if (!name) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <FiUser className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
      By {name}
    </span>
  );
}

/** What the card says before you open it. */
function summaryOf(post: Announcement): string {
  return (post.excerpt || post.body || "").slice(0, 180);
}

export default function News() {
  const navigate = useNavigate();

  /* "" = every kind. The chip row filters on the server, so what is counted
     and what is listed always describe the same set. */
  const [kind, setKind] = useState<"" | PostKind>("");
  const [payload, setPayload] = useState<Payload | null>(() =>
    readPublicCache<Payload>("news")
  );
  const [offline, setOffline] = useState(false);

  /*
   * Three at a time.
   *
   * A wall of every post the barangay has ever made pushes the Upcoming
   * Events block off the bottom of a phone — and what is coming up is the
   * question most residents open the page with. So the rest is asked for
   * rather than given.
   */
  const [shown, setShown] = useState(3);

  useEffect(() => {
    api
      .get("/announcements", { params: kind ? { category: kind } : {} })
      .then((r) => {
        const body = r.data.data ?? {};
        const next: Payload = {
          data: body.data ?? [],
          upcoming: body.upcoming ?? [],
          counts: body.counts ?? {},
        };
        setPayload(next);
        setOffline(false);
        if (!kind) writePublicCache("news", next);
      })
      /* Unreachable API — keep whatever was cached, and say so with the
         bundled samples rather than an empty page. */
      .catch(() => setOffline(true));

    /* A new filter is a new list; showing 9 of the last one is meaningless. */
    setShown(3);
  }, [kind]);

  const allPosts = payload?.data ?? [];
  const posts = allPosts.slice(0, shown);
  const upcoming = payload?.upcoming ?? [];
  const counts = payload?.counts ?? {};
  const totalPosts = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <section id="news" className="pattern pattern-dots bg-secondary py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Stay Updated"
          title="News & Announcements"
          subtitle="Announcements, events, activities, advisories and programs from your barangay government."
        />

        {/*
          The five kinds, as filters.

          A barangay does not publish one thing. An assembly next Tuesday and
          a recap of last month's road clearing are both "news" and only one
          of them is worth a resident's attention today — so the page lets
          them say which they came for.
        */}
        <Reveal delay={0.05}>
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {[{ key: "" as const, label: "All", count: totalPosts }, ...POST_KINDS.map((k) => ({
              key: k,
              label: KIND[k].plural,
              count: counts[k] ?? 0,
            }))].map((chip) => (
              <button
                key={chip.key || "all"}
                type="button"
                onClick={() => setKind(chip.key)}
                aria-pressed={kind === chip.key}
                className={`cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                  kind === chip.key
                    ? "bg-primary text-white shadow-sm"
                    : "bg-white text-dark hover:bg-primary/10"
                }`}
              >
                {chip.label}
                {chip.count > 0 && <span className="ml-1.5 opacity-70">{chip.count}</span>}
              </button>
            ))}
          </div>
        </Reveal>

        {/*
          A floor under the whole block.

          Without it the section is 900px tall with three posts and 200px
          with none, and the page below it jumps up the moment a filter comes
          back empty. The floor is roughly one row of cards, so the layout
          settles once and stays.
        */}
        <div className="min-h-[30rem]">
        {/* Nothing posted yet, or nothing of the chosen kind. */}
        {payload && posts.length === 0 && (
          <Reveal>
            <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm">
              <p className="text-lg font-semibold text-dark">
                {kind ? `No ${KIND[kind].plural.toLowerCase()} right now.` : "Nothing posted yet."}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {kind
                  ? "Try another kind, or check back soon."
                  : "The barangay's announcements will appear here."}
              </p>
            </div>
          </Reveal>
        )}

        {/* The API could not be reached — the bundled samples say what this
            section looks like rather than leaving a hole in the page. */}
        {offline && !payload && (
          <Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {samples.slice(0, 3).map((s) => (
                <article key={s.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                  <img src={s.image} alt="" className="h-44 w-full object-cover" />
                  <div className="p-5">
                    <p className="text-sm text-gray-400">{s.date}</p>
                    <h3 className="mt-1 font-bold text-dark">{s.title}</h3>
                  </div>
                </article>
              ))}
            </div>
          </Reveal>
        )}

        {/*
          Every post of the chosen kind, in one grid.

          There was a featured card above this, one post lifted out and drawn
          large. With the handful of posts a barangay has at a time, that took
          a screen and a half to show two things — the same information, laid
          out so that less of it fits. Ordering already does that job: the
          office puts what matters first, and the chips take a resident
          straight to the kind they came for.
        */}
        {posts.length > 0 && (
          <>
            <Reveal delay={0.05}>
              <h3 className="mb-4 text-lg font-bold text-dark">
                {kind ? KIND[kind].plural : "Latest Updates"}
                <span className="ml-2 text-sm font-medium text-gray-400">
                  {allPosts.length}
                </span>
              </h3>
            </Reveal>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, i) => {
                const isAdvisory = kindOf(post.category) === "Advisory";

                return (
                  <Reveal key={post.id} delay={0.05 + i * 0.05}>
                    <article
                      onClick={() => navigate(`/news/${post.id}`)}
                      className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl bg-white shadow-sm transition-shadow hover:shadow-lg ${
                        /*
                          An advisory does not look like the rest. It is the
                          one kind a resident needs to notice before they have
                          decided whether to read the page — a road closure
                          styled like a fiesta recap is a road closure nobody
                          sees in time.
                        */
                        isAdvisory ? "border-l-4 border-danger" : ""
                      }`}
                    >
                      {post.image_url && (
                        <span className="relative block h-44 shrink-0 overflow-hidden bg-secondary">
                          <img
                            src={post.image_url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        </span>
                      )}

                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <div className="flex items-start justify-between gap-2">
                          <KindBadge post={post} />
                          {isAdvisory && (
                            <FiAlertTriangle
                              className="h-5 w-5 shrink-0 text-danger"
                              aria-label="Advisory"
                            />
                          )}
                        </div>

                        <h4 className="font-bold leading-snug text-dark">{post.title}</h4>

                        <Facts post={post} className="text-xs text-gray-500" />

                        <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">
                          {summaryOf(post)}
                        </p>

                        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                          <Byline post={post} className="text-xs text-gray-400" />
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                            Read more
                            <FiArrowRight
                              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                              aria-hidden="true"
                            />
                          </span>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>

            {/* The rest, when somebody wants it. */}
            {allPosts.length > shown && (
              <Reveal delay={0.05}>
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + 3)}
                    className="cursor-pointer rounded-full border-2 border-primary px-8 py-3 text-sm font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    Load more
                    <span className="ml-2 font-semibold opacity-70">
                      {allPosts.length - shown} more
                    </span>
                  </button>
                </div>
              </Reveal>
            )}
          </>
        )}
        </div>

        {/*
          What is still to come.

          The rest of this section is a record of what the barangay has said;
          this is the only part that answers "what is happening next", which
          is the question most residents open the page with. Kept out of the
          kind filter on purpose — it is useful whichever chip is chosen.
        */}
        {upcoming.length > 0 && (
          <Reveal delay={0.1}>
            <div className="mt-12 rounded-3xl border border-teal-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-dark">Upcoming Events</h3>
                <span className="text-xs font-semibold text-teal-700">
                  {upcoming.length} coming up
                </span>
              </div>

              <ul className="divide-y divide-gray/70">
                {upcoming.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/news/${event.id}`)}
                      className="flex w-full cursor-pointer items-center gap-4 py-4 text-left transition-colors hover:bg-secondary/60"
                    >
                      {/* The date block: the thing somebody is looking for. */}
                      <span className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                        <span className="text-[11px] font-bold uppercase">
                          {postDate(event.event_at).split(" ")[0]?.slice(0, 3)}
                        </span>
                        <span className="text-xl font-extrabold leading-none">
                          {event.event_at?.slice(8, 10)}
                        </span>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-dark">{event.title}</span>
                        <Facts post={event} className="mt-1 text-xs text-gray-500" />
                        {event.registration_deadline && (
                          <span className="mt-1 block text-xs font-semibold text-amber-700">
                            Register by {postDate(event.registration_deadline)}
                          </span>
                        )}
                      </span>

                      <FiArrowRight
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
