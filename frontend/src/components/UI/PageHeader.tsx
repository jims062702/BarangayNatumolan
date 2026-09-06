import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { menuFor } from "../../lib/menu";
import { useAuth } from "../../contexts/AuthContext";
import Breadcrumbs, { type Crumb } from "./Breadcrumbs";
import { useReveal, revealProps } from "../../hooks/useReveal";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /**
   * A trail this page works out for itself.
   *
   * For the handful that know something the route cannot say — a resident's
   * name on their own detail page, say. Everything else is derived.
   */
  crumbs?: Crumb[];
  /** For a page that is its own root: the dashboard, and the public site. */
  noCrumbs?: boolean;
}

/**
 * Where a page sits, worked out from the menu that put it there.
 *
 * Breadcrumbs used to be hand-written, and so four screens out of fifty-four
 * had them. Hand-adding the other fifty would have fixed today and drifted
 * again by the next page somebody wrote — so the trail is derived here, once,
 * from the sidebar itself. A page reachable from the menu has a trail because
 * it is in the menu; nobody has to remember.
 *
 * The menu is the right source rather than a second table of route names: it
 * is already filtered by role and office, so the trail can never name a
 * section this user cannot open.
 */
function trailFor(pathname: string, sections: ReturnType<typeof menuFor>, title: string): Crumb[] {
  let best: { heading?: string; item: { label: string; to: string } } | null = null;

  for (const section of sections) {
    for (const item of section.items) {
      const exact = pathname === item.to;
      const inside = pathname.startsWith(item.to + "/");

      if (!exact && !inside) continue;

      // The longest match wins: /population/rbim beats /population.
      if (!best || item.to.length > best.item.to.length) {
        best = { heading: section.heading, item };
      }
    }
  }

  if (!best) return [];

  const crumbs: Crumb[] = [];

  /*
   * The section heading is not a link — there is no page behind "Population
   * Office", only a group of them. A crumb that looks clickable and is not
   * is worse than a plain one.
   */
  if (best.heading) {
    crumbs.push({ label: best.heading });
  }

  const atTheItem = pathname === best.item.to;

  crumbs.push({ label: best.item.label, to: atTheItem ? undefined : best.item.to });

  /*
   * A page deeper than the menu goes — a case, a resident, a form — names
   * itself with its own title, which is the only thing that knows what it is.
   */
  if (!atTheItem) {
    crumbs.push({ label: title });
  }

  return crumbs;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
  noCrumbs = false,
}: PageHeaderProps) {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const trail = crumbs ?? (user && !noCrumbs ? trailFor(pathname, menuFor(user), title) : []);

  /*
   * The title moves too, and first — it is the top of the page, so it is
   * what the reveal should look like it started from. `once` here: a header
   * that re-animates every time the office scrolls back up is a header that
   * gets in the way.
   */
  const { ref, shown } = useReveal<HTMLDivElement>({ once: true });
  const reveal = revealProps(shown);

  return (
    <div ref={ref} style={reveal.style} className={`mb-6 ${reveal.className}`}>
      {/*
        One crumb is the page you are already on, which tells nobody
        anything. The trail earns its space from two.
      */}
      {trail.length > 1 && <Breadcrumbs items={trail} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
