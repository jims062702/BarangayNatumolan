import type { IconType } from "react-icons";
import {
  FiAward,
  FiBarChart2,
  FiBell,
  FiBookOpen,
  FiCalendar,
  FiClipboard,
  FiFileText,
  FiHeart,
  FiHelpCircle,
  FiHome,
  FiImage,
  FiLayers,
  FiMap,
  FiSettings,
  FiShield,
  FiSmile,
  FiTrendingUp,
  FiUser,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";
import type { User } from "../types";

export interface MenuItem {
  label: string;
  to: string;
  icon: IconType;
}

export interface MenuSection {
  heading?: string;
  items: MenuItem[];
}

/** Sidebar menu, filtered by the account's role/office (mirrors the API gates). */
export function menuFor(user: User): MenuSection[] {
  if (user.role === "Resident") {
    return [
      {
        items: [
          { label: "My Dashboard", to: "/portal", icon: FiHome },
          { label: "My Requests", to: "/portal/requests", icon: FiFileText },
          { label: "Appointments", to: "/portal/appointments", icon: FiCalendar },
          { label: "My Certificates", to: "/portal/certificates", icon: FiAward },
          { label: "Announcements", to: "/portal/announcements", icon: FiBell },
          { label: "Service Guide", to: "/portal/assistant", icon: FiHelpCircle },
          { label: "My Profile", to: "/portal/profile", icon: FiUser },
        ],
      },
    ];
  }

  const sections: MenuSection[] = [
    { items: [{ label: "Dashboard", to: "/dashboard", icon: FiHome }] },
  ];

  const core: MenuItem[] = [
    { label: "Residents", to: "/residents", icon: FiUsers },
    { label: "Requests & Queue", to: "/services", icon: FiClipboard },
    { label: "Certificates", to: "/certificates", icon: FiAward },
    { label: "Appointments", to: "/appointments", icon: FiCalendar },
  ];

  // The Clerk runs the front desk: requests & queue + certificates.
  if (user.role === "Clerk") {
    sections.push({
      heading: "Main Office",
      items: [
        { label: "Requests & Queue", to: "/services", icon: FiClipboard },
        { label: "Certificates", to: "/certificates", icon: FiAward },
      ],
    });
    return sections;
  }

  switch (user.office) {
    case "Main Office":
      if (user.role === "Punong Barangay") {
        // The PB decides certificates; appointments and KP cases remain.
        // Residents and Requests & Queue are the clerk's/offices' work.
        sections.push({
          heading: "Main Office",
          items: [
            { label: "Certificates", to: "/certificates", icon: FiAward },
            { label: "Appointments", to: "/appointments", icon: FiCalendar },
          ],
        });
        sections.push({
          heading: "Lupon Tagapamayapa",
          items: [{ label: "KP Cases", to: "/lupon/cases", icon: FiBookOpen }],
        });
      } else {
        sections.push({ heading: "Main Office", items: core });
      }
      sections.push({
        heading: "Content",
        items: [{ label: "Service Guides", to: "/manage/service-guides", icon: FiHelpCircle }],
      });
      break;

    case "VAWC":
      sections.push({
        heading: "VAWC Desk",
        items: [
          { label: "Confidential Cases", to: "/vawc/cases", icon: FiShield },
          { label: "Reports", to: "/vawc/reports", icon: FiBarChart2 },
        ],
      });
      break;

    case "Lupon":
      sections.push({
        heading: "Lupon Tagapamayapa",
        items: [
          { label: "Case Docket", to: "/lupon/cases", icon: FiBookOpen },
          { label: "Requests & Queue", to: "/services", icon: FiClipboard },
          { label: "Appointments", to: "/appointments", icon: FiCalendar },
        ],
      });
      break;

    case "Population":
      sections.push({
        heading: "Population Office",
        items: [
          { label: "Residents", to: "/residents", icon: FiUsers },
          { label: "Households", to: "/population/households", icon: FiMap },
          { label: "Population Events", to: "/population/events", icon: FiTrendingUp },
          { label: "Sector Lists", to: "/population/sectors", icon: FiLayers },
          { label: "Portal Accounts", to: "/population/accounts", icon: FiUserPlus },
        ],
      });
      break;

    case "Health Station":
      sections.push({
        heading: "Health Station",
        items: [
          { label: "Patient Visits", to: "/health/visits", icon: FiHeart },
          { label: "Immunization", to: "/health/immunization", icon: FiShield },
          { label: "Maternal & Child", to: "/health/maternal-child", icon: FiSmile },
        ],
      });
      break;

    case "SK":
      sections.push({
        heading: "Sangguniang Kabataan",
        items: [
          { label: "Home Pictures", to: "/sk/hero-slides", icon: FiImage },
          { label: "News & Announcements", to: "/sk/announcements", icon: FiBell },
          { label: "Officials", to: "/sk/officials", icon: FiAward },
        ],
      });
      break;

    case "Admin":
      sections.push({ heading: "Records", items: core });
      sections.push({
        heading: "SK / Landing Content",
        items: [
          { label: "Home Pictures", to: "/sk/hero-slides", icon: FiImage },
          { label: "News & Announcements", to: "/sk/announcements", icon: FiBell },
          { label: "Officials", to: "/sk/officials", icon: FiAward },
        ],
      });
      sections.push({
        heading: "System Administration",
        items: [
          { label: "User Accounts", to: "/admin/users", icon: FiSettings },
          { label: "Portal Accounts", to: "/population/accounts", icon: FiUserPlus },
          { label: "Service Guides", to: "/manage/service-guides", icon: FiHelpCircle },
        ],
      });
      break;
  }

  return sections;
}
