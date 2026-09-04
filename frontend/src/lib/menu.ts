import type { IconType } from "react-icons";
import {
  FiActivity,
  FiArchive,
  FiAward,
  FiBarChart2,
  FiBell,
  FiBookOpen,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiFileText,
  FiFolder,
  FiHeart,
  FiHelpCircle,
  FiHome,
  FiImage,
  FiLayers,
  FiMap,
  FiMessageCircle,
  FiSettings,
  FiShare2,
  FiShield,
  FiSmile,
  FiTrendingUp,
  FiUser,
  FiUserCheck,
  FiUserPlus,
  FiUserX,
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
          /*
           * One entry, not two. "My Requests" and "My Certificates" listed
           * the same event twice — the asking and the document that came
           * out of it — and the two pages disagreed about its status.
           */
          { label: "My Requests", to: "/portal/requests", icon: FiAward },
          { label: "Appointments", to: "/portal/appointments", icon: FiCalendar },
          // KP cases and blotter entries they are part of. Never VAWC —
          // see PortalController::cases for why.
          { label: "My Cases", to: "/portal/cases", icon: FiBookOpen },
          { label: "Announcements", to: "/portal/announcements", icon: FiBell },
          { label: "Service Guide", to: "/portal/assistant", icon: FiHelpCircle },
          // Profile carries the family too — same question, one button.
          { label: "My Profile", to: "/portal/profile", icon: FiUser },
        ],
      },
    ];
  }

  const sections: MenuSection[] = [
    { items: [{ label: "Dashboard", to: "/dashboard", icon: FiHome }] },
  ];

  /*
   * Front-desk core: intake, the window queue, counter verification,
   * certificates and appointments.
   *
   * The resident REGISTRY is deliberately not here. Only the Population
   * Office (BPO) registers a person, so only they browse it; every other
   * office attaches a resident through the picker, which returns identity
   * fields and never the browsable registry.
   */
  const core: MenuItem[] = [
    { label: "Service Requests", to: "/services", icon: FiClipboard },
    { label: "Service Queue", to: "/queue", icon: FiUserCheck },
    // The desk's record of what was reported. Not the Lupon docket and
    // not the VAWC desk — most entries never become either.
    { label: "Blotter", to: "/blotter", icon: FiBookOpen },
    { label: "Records Verification", to: "/verify-records", icon: FiCheckSquare },
    { label: "Certificates", to: "/certificates", icon: FiAward },
    { label: "Appointments", to: "/appointments", icon: FiCalendar },
  ];

  /*
   * Referrals + aggregated reports — Main Office and the Punong Barangay.
   *
   * Every other desk already coordinates and reports inside its own module:
   * the VAWC Desk keeps a separate referral trail, the Health Station records
   * referrals on the visit/maternal/child forms, the Lupon routes through the
   * CFA, and the Population Office has its own sectoral analytics. Reports &
   * Analytics measures service requests, referrals and administrative
   * records — none of which those offices own.
   */
  const coordination: MenuItem[] = [
    { label: "Referrals", to: "/referrals", icon: FiShare2 },
    { label: "Reports & Analytics", to: "/reports", icon: FiBarChart2 },
  ];

  // The Clerk runs the front desk: requests, queue + certificates.
  if (user.role === "Clerk") {
    sections.push({
      heading: "Main Office",
      items: [
        { label: "Service Requests", to: "/services", icon: FiClipboard },
        { label: "Certificates", to: "/certificates", icon: FiAward },
        { label: "Service Queue", to: "/queue", icon: FiUserCheck },
        { label: "Blotter", to: "/blotter", icon: FiBookOpen },
        // Verification is the clerk's own step before a certificate is filed.
        { label: "Records Verification", to: "/verify-records", icon: FiCheckSquare },
      ],
    });
    return sections;
  }

  switch (user.office) {
    case "Main Office":
      if (user.role === "Punong Barangay") {
        // The PB decides certificates and adopts documents; appointments and
        // KP cases remain. Residents and the queue are the clerk's/offices' work.
        sections.push({
          heading: "Main Office",
          items: [
            { label: "Certificates", to: "/certificates", icon: FiAward },
            { label: "Appointments", to: "/appointments", icon: FiCalendar },
            { label: "Live Chat", to: "/chat", icon: FiMessageCircle },
            { label: "Administrative Records", to: "/records", icon: FiArchive },
          ],
        });
        // The PB personally conducts mediation, so the hearing calendar
        // belongs on their menu alongside the docket.
        sections.push({
          heading: "Lupon Tagapamayapa",
          items: [
            { label: "KP Cases", to: "/lupon/cases", icon: FiBookOpen },
            { label: "Hearings & KP Forms", to: "/lupon/hearings", icon: FiCalendar },
            { label: "Settlements", to: "/lupon/settlements", icon: FiFileText },
            { label: "Reports & Archives", to: "/lupon/reports", icon: FiBarChart2 },
          ],
        });
      } else {
        sections.push({
          heading: "Main Office",
          items: [
            ...core,
            { label: "Live Chat", to: "/chat", icon: FiMessageCircle },
            { label: "Administrative Records", to: "/records", icon: FiArchive },
          ],
        });
      }
      sections.push({ heading: "Coordination", items: coordination });
      sections.push({
        heading: "Content",
        items: [{ label: "Service Guides", to: "/manage/service-guides", icon: FiHelpCircle }],
      });
      break;

    // Deliberately no general Referrals/Reports entry: the VAWC Desk keeps its
    // own referral trail and anonymized reporting, isolated from shared lists.
    case "VAWC":
      sections.push({
        heading: "VAWC Desk",
        items: [
          { label: "Confidential Cases", to: "/vawc/cases", icon: FiShield },
          { label: "Referrals", to: "/vawc/referrals", icon: FiShare2 },
          { label: "Follow-Up Monitoring", to: "/vawc/followups", icon: FiActivity },
          { label: "Documents & Access Trail", to: "/vawc/documents", icon: FiFolder },
          { label: "Reports", to: "/vawc/reports", icon: FiBarChart2 },
        ],
      });
      break;

    /*
     * The Lupon works its own docket only. Request intake, the window queue
     * and appointments belong to the Main Office front desk; the Lupon's own
     * calendar is Hearings, and its own reporting is Reports & Archives.
     */
    case "Lupon":
      sections.push({
        heading: "Lupon Tagapamayapa",
        items: [
          { label: "Case Docket", to: "/lupon/cases", icon: FiBookOpen },
          { label: "Hearings & KP Forms", to: "/lupon/hearings", icon: FiCalendar },
          { label: "Settlements", to: "/lupon/settlements", icon: FiFileText },
          { label: "Reports & Archives", to: "/lupon/reports", icon: FiBarChart2 },
        ],
      });
      break;

    case "Population":
      sections.push({
        heading: "Population Office",
        items: [
          { label: "Residents", to: "/residents", icon: FiUsers },
          // On the register so families are whole, but not constituents —
          // and impossible to find before this, short of opening the
          // relative who named them.
          { label: "Non-residents", to: "/residents/non-residents", icon: FiUserX },
          { label: "Households", to: "/population/households", icon: FiMap },
          // The DILG baseline census the BHW collects house to house.
          { label: "RBIM Census", to: "/population/rbim", icon: FiClipboard },
          { label: "Population Events", to: "/population/events", icon: FiTrendingUp },
          { label: "Sector Lists", to: "/population/sectors", icon: FiLayers },
          { label: "Records Verification", to: "/verify-records", icon: FiCheckSquare },
          { label: "Portal Accounts", to: "/population/accounts", icon: FiUserPlus },
        ],
      });
      break;

    // Health referrals are recorded on the visit / maternal / child forms
    // themselves, and the station reports from its own coverage figures.
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

    // System administrator, not a barangay office — keeps reach into every
    // module so bad data can be corrected. (To be retired once each office
    // is seeded with its own account.)
    case "Admin":
      sections.push({
        heading: "Records",
        items: [
          { label: "Residents", to: "/residents", icon: FiUsers },
          { label: "Non-residents", to: "/residents/non-residents", icon: FiUserX },
          ...core,
          { label: "Live Chat", to: "/chat", icon: FiMessageCircle },
          { label: "Administrative Records", to: "/records", icon: FiArchive },
        ],
      });
      sections.push({ heading: "Coordination", items: coordination });
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
