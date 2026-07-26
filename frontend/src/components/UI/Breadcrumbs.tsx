import { Link } from "react-router-dom";
import { FiChevronRight } from "react-icons/fi";

export interface Crumb {
  label: string;
  /** Link target; omit for the current (last) page. */
  to?: string;
}

/** Simple breadcrumb trail for easy navigation on inner pages. */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        {items.map((crumb, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {crumb.to ? (
              <Link to={crumb.to} className="transition-colors hover:text-primary">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-dark">
                {crumb.label}
              </span>
            )}
            {index < items.length - 1 && (
              <FiChevronRight aria-hidden="true" className="h-4 w-4 text-gray-400" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
