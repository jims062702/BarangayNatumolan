/**
 * Shared by the Navbar and the Footer quick links.
 * `id` matches the section element ids on the landing page.
 */
export interface NavLink {
  id: string;
  label: string;
  short: string;
}

export const navLinks: NavLink[] = [
  { id: "home", label: "Home", short: "Home" },
  { id: "news", label: "News & Announcement", short: "News" },
  { id: "about", label: "About", short: "About" },
  { id: "services", label: "Services", short: "Services" },
  { id: "offices", label: "Offices", short: "Offices" },
  { id: "officials", label: "Officials", short: "Officials" },
  { id: "contact", label: "Contact Us", short: "Contact" },
];

export const sectionIds: string[] = navLinks.map((link) => link.id);
