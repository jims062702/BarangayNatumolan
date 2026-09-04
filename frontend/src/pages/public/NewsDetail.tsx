import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiCalendar, FiChevronRight, FiClock, FiMapPin } from "react-icons/fi";
import { api } from "../../lib/api";
import { scrollToLandingSection } from "../../lib/landingSection";
import { news as staticNews } from "../../data/news";

interface ApiAnnouncement {
  id: number;
  title: string;
  body: string;
  category?: string | null;
  location?: string | null;
  event_at?: string | null;
  event_time?: string | null;
  image_url?: string | null;
  published_at?: string | null;
}

/** Display shape shared by API posts and the bundled fallback items. */
interface NewsView {
  id: number | string;
  title: string;
  category?: string | null;
  date: string;
  time: string;
  location: string;
  description: string;
  image: string;
}

function formatDate(value?: string | null): string {
  return value ? new Date(value).toLocaleDateString("en-PH", { dateStyle: "long" }) : "";
}

function toView(a: ApiAnnouncement, index = 0): NewsView {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    date: formatDate(a.event_at ?? a.published_at),
    time: a.event_time ?? "",
    location: a.location ?? "Barangay Natumolan",
    description: a.body,
    image: a.image_url || staticNews[index % staticNews.length].image,
  };
}

export default function NewsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  // The carousel passes its item along — used as a fallback so the bundled
  // sample posts (not in the database) still open properly.
  const passed = (useLocation().state as { item?: NewsView } | null)?.item;

  const [item, setItem] = useState<NewsView | null>(null);
  const [related, setRelated] = useState<NewsView[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setItem(null);
    setRelated([]);
    setMissing(false);

    api
      .get(`/announcements/${id}`)
      .then((r) => {
        setItem(toView(r.data.data.announcement));
        setRelated((r.data.data.related as ApiAnnouncement[]).map(toView));
      })
      .catch(() => {
        if (passed) {
          // Bundled sample post — show it, with the other samples as related.
          setItem(passed);
          setRelated(
            staticNews
              .filter((n) => String(n.id) !== String(passed.id))
              .slice(0, 3)
              .map((n) => ({ ...n, category: "News" }))
          );
        } else {
          setMissing(true);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="bg-secondary pb-20 pt-28">
      {/* max-w-7xl and the same padding as the navbar, so the breadcrumb starts
          flush with the logo. At max-w-4xl it sat 192px inboard of it. */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
            <li>
              <Link to="/" className="transition-colors hover:text-primary">Home</Link>
            </li>
            <li aria-hidden="true"><FiChevronRight className="h-4 w-4" /></li>
            <li>
              {/* A plain "/#news" reloads the app and still lands on Home,
                  because the section is not in the DOM when the browser
                  resolves the fragment. */}
              <a
                href="/#news"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/");
                  scrollToLandingSection("news");
                }}
                className="transition-colors hover:text-primary"
              >
                News &amp; Announcements
              </a>
            </li>
            <li aria-hidden="true"><FiChevronRight className="h-4 w-4" /></li>
            <li aria-current="page" className="max-w-[16rem] truncate font-medium text-dark sm:max-w-md">
              {item?.title ?? (missing ? "Not found" : "Loading…")}
            </li>
          </ol>
        </nav>

        {missing && (
          <div className="rounded-3xl bg-white p-10 text-center shadow-lg shadow-primary/5">
            <p className="text-lg font-semibold text-dark">Announcement not found</p>
            <p className="mt-2 text-sm text-gray-500">
              It may have been removed or unpublished.
            </p>
            <a
              href="/#news"
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
                scrollToLandingSection("news");
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              <FiArrowLeft aria-hidden="true" /> Back to News &amp; Announcements
            </a>
          </div>
        )}

        {!missing && !item && (
          <div aria-hidden="true" className="overflow-hidden rounded-3xl bg-white shadow-lg shadow-primary/5">
            <div className="h-72 animate-pulse bg-gray/60 sm:h-96" />
            <div className="space-y-4 p-8">
              <div className="h-6 w-2/3 animate-pulse rounded-full bg-gray/60" />
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-gray/60" />
              <div className="h-28 animate-pulse rounded-2xl bg-gray/60" />
            </div>
          </div>
        )}

        {item && (
          <article className="overflow-hidden rounded-3xl bg-white shadow-lg shadow-primary/5">
            {/* Taller to stay in proportion now that the card is wider. */}
            <img
              src={item.image}
              alt={item.title}
              className="h-72 w-full object-cover sm:h-[30rem]"
            />
            <div className="p-6 sm:p-10">
              {item.category && (
                <span className="inline-block rounded-full bg-primary/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  {item.category}
                </span>
              )}
              <h1 className="mt-3 text-3xl font-extrabold leading-tight text-dark sm:text-4xl">
                {item.title}
              </h1>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-gray pb-5 text-sm text-gray-500">
                {item.date && (
                  <span className="inline-flex items-center gap-2">
                    <FiCalendar className="shrink-0 text-primary" aria-hidden="true" /> {item.date}
                  </span>
                )}
                {item.time && (
                  <span className="inline-flex items-center gap-2">
                    <FiClock className="shrink-0 text-primary" aria-hidden="true" /> {item.time}
                  </span>
                )}
                <span className="inline-flex items-center gap-2">
                  <FiMapPin className="shrink-0 text-primary" aria-hidden="true" /> {item.location}
                </span>
              </div>
              {/* Larger body text, but the line length is capped: the card is
                  now 1280px wide and prose that runs the full width is very
                  hard to read back to the next line. */}
              <p className="mt-6 max-w-4xl whitespace-pre-line text-lg leading-relaxed text-gray-600">
                {item.description}
              </p>
            </div>
          </article>
        )}

        {/* Related news */}
        {item && related.length > 0 && (
          <section aria-label="Related news" className="mt-12">
            <h2 className="text-xl font-bold text-dark">Related News &amp; Announcements</h2>
            <span aria-hidden="true" className="mt-2 block h-1 w-12 rounded-full bg-primary" />
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {related.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(`/news/${r.id}`, { state: { item: r } })}
                  className="group cursor-pointer overflow-hidden rounded-2xl bg-white text-left shadow-md transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/15"
                >
                  <div className="h-36 overflow-hidden">
                    <img
                      src={r.image}
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-dark group-hover:text-primary">
                      {r.title}
                    </p>
                    {r.date && <p className="mt-1.5 text-xs text-gray-500">{r.date}</p>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
