import { Link } from "react-router-dom";
import { useAuth, homePathFor } from "../contexts/AuthContext";

/**
 * Catch-all for any address with no page behind it. Without this, React
 * Router matches nothing and renders an empty document — the blank white
 * screen a mistyped or stale URL used to produce.
 */
export default function NotFound() {
  const { user } = useAuth();
  const home = user ? homePathFor(user) : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-secondary px-4 text-center">
      <span className="text-5xl" aria-hidden="true">
        🧭
      </span>
      <h1 className="text-2xl font-bold text-dark">Page not found</h1>
      <p className="max-w-md text-sm text-gray-500">
        This address doesn’t match any page in the system. It may have been
        mistyped, or the page may have moved.
      </p>
      <Link
        to={home}
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
      >
        {user ? "Back to my dashboard" : "Back to the home page"}
      </Link>
    </div>
  );
}
