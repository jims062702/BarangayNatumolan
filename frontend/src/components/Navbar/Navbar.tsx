import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiMenu, FiX } from "react-icons/fi";
import useScrollPosition from "../../hooks/useScrollPosition";
import useActiveSection from "../../hooks/useActiveSection";
import AccountMenu from "./AccountMenu";
import { scrollToLandingSection } from "../../lib/landingSection";
import { navLinks, sectionIds } from "../../data/navLinks";
import logo from "../../assets/logo/logo.svg";

export default function Navbar() {
  const scrollY = useScrollPosition();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  // Only the landing page has the dark hero behind the navbar; on every
  // other page (e.g. /news/…) the bar must be solid or the text is invisible.
  const pathname = useLocation().pathname;
  const onLanding = pathname === "/";
  // Keyed on the route: this layout never remounts, so without it the section
  // observer would keep watching the (absent) sections of the previous page.
  const active = useActiveSection(sectionIds, pathname);

  // Transparent over the hero; solid glass when scrolled, off the landing
  // page, or when the mobile menu is open.
  const solid = !onLanding || scrollY > 40 || menuOpen;
  const closeMenu = () => setMenuOpen(false);

  // Section anchors only exist on the landing page — elsewhere, link back
  // to the landing page with the fragment.
  const sectionHref = (id: string) => (onLanding ? `#${id}` : `/#${id}`);

  /**
   * Scroll to a section ourselves instead of leaving it to the browser's
   * fragment navigation, which lands on Home in both directions — see
   * `scrollToLandingSection` for the two reasons why.
   */
  const goToSection = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    closeMenu();

    if (onLanding) {
      scrollToLandingSection(id);
      return;
    }

    // Coming from another route: switch to the landing page first, then scroll
    // once the section has actually rendered.
    navigate("/");
    scrollToLandingSection(id);
  };

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        solid
          ? "bg-white/90 shadow-lg shadow-primary/5 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* Brand */}
        <a
          href={sectionHref("home")}
          onClick={(e) => goToSection(e, "home")}
          className="flex items-center gap-3"
        >
          <img src={logo} alt="Barangay Natumolan logo" className="h-11 w-11" />
          <span className="leading-tight">
            <span
              className={`block text-sm font-bold transition-colors sm:text-base ${
                solid ? "text-primary" : "text-white"
              }`}
            >
              Barangay Natumolan
            </span>
            <span
              className={`block text-[11px] font-medium transition-colors ${
                solid ? "text-gray-500" : "text-white/80"
              }`}
            >
              Tagoloan, Misamis Oriental
            </span>
          </span>
        </a>

        {/* Desktop links */}
        <ul className="hidden items-center gap-5 lg:flex">
          {navLinks.map((link) => {
            const isActive = active === link.id;
            return (
              <li key={link.id}>
                <a
                  href={sectionHref(link.id)}
                  onClick={(e) => goToSection(e, link.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`group relative py-2 text-sm font-medium transition-colors duration-300 ${
                    solid
                      ? isActive
                        ? "text-primary"
                        : "text-dark hover:text-primary"
                      : isActive
                        ? "text-white"
                        : "text-white/85 hover:text-white"
                  }`}
                >
                  {link.label}
                  <span
                    aria-hidden="true"
                    className={`absolute -bottom-0.5 left-0 h-0.5 w-full origin-left rounded-full transition-transform duration-300 ${
                      solid ? "bg-primary" : "bg-white"
                    } ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`}
                  />
                </a>
              </li>
            );
          })}
          <li>
            <AccountMenu solid={solid} />
          </li>
        </ul>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 lg:hidden">
          <AccountMenu solid={solid} />
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300 ${
              solid ? "text-primary" : "text-white"
            }`}
          >
            {menuOpen ? <FiX className="h-6 w-6" /> : <FiMenu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-gray bg-white/95 backdrop-blur-md lg:hidden"
          >
            <ul className="space-y-1 px-4 pb-6 pt-3">
              {navLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={sectionHref(link.id)}
                    onClick={(e) => goToSection(e, link.id)}
                    className={`block rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                      active === link.id
                        ? "bg-primary/10 text-primary"
                        : "text-dark hover:bg-primary/5 hover:text-primary"
                    }`}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
