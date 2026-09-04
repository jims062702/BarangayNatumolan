import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiGrid, FiLogOut, FiUser } from "react-icons/fi";
import { useAuth, homePathFor } from "../../contexts/AuthContext";
import { useSignOut } from "../../hooks/useSignOut";

interface AccountMenuProps {
  /** True when the navbar has its solid/glass background (scrolled, or off the hero). */
  solid: boolean;
}

/**
 * The navbar's person icon.
 *
 * Signed out it is exactly what it was — a plain link to /login, with nothing
 * on hover. Signed in it opens a small menu offering the dashboard and logout,
 * so someone who is already authenticated is not sent back to a login form.
 *
 * Opens on hover for a mouse and on tap for touch (where hover does not
 * exist), and closes on Escape, on leaving, or on a click elsewhere.
 */
export default function AccountMenu({ solid }: AccountMenuProps) {
  const { user, isAuthenticated, loading } = useAuth();
  // Stay on the public site rather than dropping onto a login form.
  const signOut = useSignOut("/");
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const trigger = `flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-300 ${
    solid
      ? "bg-primary/10 text-primary hover:bg-primary hover:text-white"
      : "bg-white/15 text-white hover:bg-white hover:text-primary"
  }`;

  /*
   * Still checking. NOT the same as signed out, and drawing the signed-out
   * icon here is what made a logged-in person look logged out every time the
   * app loaded fresh — a new tab, a typed URL, a refresh. The session is in
   * localStorage the whole time; it just has not been confirmed yet, and the
   * confirmation is a round trip.
   *
   * So the button holds its place and says nothing until there is something
   * true to say. A quiet icon for half a second beats telling somebody they
   * are signed out when they are not.
   */
  if (loading) {
    return (
      <span
        aria-hidden="true"
        className={`${trigger} pointer-events-none opacity-50`}
        title="Checking your session…"
      >
        <FiUser className="h-5 w-5 animate-pulse" />
      </span>
    );
  }

  // Signed out: unchanged behaviour — straight to the login page, no menu.
  if (!isAuthenticated || !user) {
    return (
      <Link to="/login" aria-label="Login to the Barangay MIS" title="Login" className={trigger}>
        <FiUser className="h-5 w-5" />
      </Link>
    );
  }

  const askSignOut = async () => {
    // Close the menu before the dialog opens, so it is not left hanging
    // behind it whichever way they answer.
    setOpen(false);
    await signOut();
  };

  return (
    <div
      ref={wrapper}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.name}`}
        title={user.name}
        className={trigger}
      >
        <FiUser className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            /* Anchored to the right so it never runs off a narrow screen, and
               capped to the viewport width on the smallest phones. */
            className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray bg-white shadow-xl"
          >
            <div className="border-b border-gray px-4 py-3">
              <p className="truncate text-sm font-semibold text-dark">{user.name}</p>
              <p className="truncate text-xs text-gray-500">
                {user.role === "Resident" ? "Resident" : `${user.role} — ${user.office}`}
              </p>
            </div>

            <Link
              to={homePathFor(user)}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-dark transition-colors hover:bg-primary/5 hover:text-primary"
            >
              <FiGrid className="h-4 w-4 shrink-0" aria-hidden="true" />
              Go to Dashboard
            </Link>

            <button
              type="button"
              role="menuitem"
              onClick={askSignOut}
              className="flex w-full items-center gap-2.5 border-t border-gray px-4 py-3 text-left text-sm font-medium text-danger transition-colors hover:bg-danger/5"
            >
              <FiLogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
