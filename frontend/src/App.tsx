import { lazy, Suspense } from "react";
import {
  AppShellSkeleton,
  LoginSkeleton,
  PublicPageSkeleton,
} from "./components/UI/Skeleton";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import FormValidationStyler from "./components/FormValidationStyler";
import IdleSignOut from "./components/IdleSignOut";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFound from "./components/NotFound";
import MainLayout from "./layouts/MainLayout";

// The public landing page loads eagerly — it is what most residents open.
import LandingPage from "./pages/LandingPage";

// Everything else is lazy-loaded (code-split): visitors download only the
// code for the page they open, which keeps the public site small and fast.
const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const VerifyCertificate = lazy(() => import("./pages/public/VerifyCertificate"));
const NewsDetail = lazy(() => import("./pages/public/NewsDetail"));

// Office dashboards
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Resident portal
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalRequests = lazy(() => import("./pages/portal/PortalRequests"));
const PortalAppointments = lazy(() => import("./pages/portal/PortalAppointments"));
const PortalAnnouncements = lazy(() => import("./pages/portal/PortalAnnouncements"));
const PortalAssistant = lazy(() => import("./pages/portal/PortalAssistant"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));

// Shared core (staff)
const PortalCases = lazy(() => import("./pages/portal/PortalCases"));
const ResidentList = lazy(() => import("./pages/residents/ResidentList"));
const NonResidentList = lazy(() => import("./pages/residents/NonResidentList"));
const ResidentCreate = lazy(() => import("./pages/residents/ResidentCreate"));
const ResidentDetail = lazy(() => import("./pages/residents/ResidentDetail"));
const ResidentEdit = lazy(() => import("./pages/residents/ResidentEdit"));
const ServiceRequestList = lazy(() => import("./pages/services/ServiceRequestList"));
const CertificateList = lazy(() => import("./pages/services/CertificateList"));
const CertificateReport = lazy(() => import("./pages/services/CertificateReport"));
const LiveChat = lazy(() => import("./pages/chat/LiveChat"));
const AppointmentScheduler = lazy(() => import("./pages/appointments/AppointmentScheduler"));
const BarangaySessions = lazy(() => import("./pages/sessions/BarangaySessions"));

// VAWC Office
const VawcCasesList = lazy(() => import("./pages/vawc/VawcCasesList"));
const VawcCaseDetail = lazy(() => import("./pages/vawc/VawcCaseDetail"));
const VawcReferrals = lazy(() => import("./pages/vawc/VawcReferrals"));
const VawcFollowups = lazy(() => import("./pages/vawc/VawcFollowups"));
const VawcDocuments = lazy(() => import("./pages/vawc/VawcDocuments"));
const VawcReports = lazy(() => import("./pages/vawc/VawcReports"));

// Lupon Tagapamayapa
const LuponCasesList = lazy(() => import("./pages/lupon/LuponCasesList"));
const LuponCaseDetail = lazy(() => import("./pages/lupon/LuponCaseDetail"));
const LuponHearings = lazy(() => import("./pages/lupon/LuponHearings"));
const LuponSettlements = lazy(() => import("./pages/lupon/LuponSettlements"));
const LuponReports = lazy(() => import("./pages/lupon/LuponReports"));

// Population Office
const HouseholdList = lazy(() => import("./pages/population/HouseholdList"));
const RbimList = lazy(() => import("./pages/population/RbimList"));
const RbimForm = lazy(() => import("./pages/population/RbimForm"));
const RecordsVerification = lazy(() => import("./pages/population/RecordsVerification"));
const PopulationEvents = lazy(() => import("./pages/population/PopulationEvents"));
const SectorLists = lazy(() => import("./pages/population/SectorLists"));
const ResidentAccounts = lazy(() => import("./pages/population/ResidentAccounts"));

// Health Station
const PatientVisits = lazy(() => import("./pages/health/PatientVisits"));
const Immunization = lazy(() => import("./pages/health/Immunization"));
const MaternalChild = lazy(() => import("./pages/health/MaternalChild"));

// Sangguniang Kabataan (landing content)
const SkHeroSlides = lazy(() => import("./pages/sk/SkHeroSlides"));
const SkOfficials = lazy(() => import("./pages/sk/SkOfficials"));

// Management / Admin
const AdministrativeRecords = lazy(() => import("./pages/records/AdministrativeRecords"));
const AnnouncementsManage = lazy(() => import("./pages/manage/AnnouncementsManage"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const NonResidents = lazy(() => import("./pages/admin/NonResidents"));

/**
 * What a page chunk downloads behind.
 *
 * The same shell the session check shows, so the two waits look like one
 * page loading rather than two different loading screens in a row.
 */
function PageLoader() {
  return <PublicPageSkeleton />;
}

/**
 * The dashboard shell, with the skeleton that matches it.
 *
 * Its own boundary, so the app shell is shown for the pages that HAVE an app
 * shell and for nothing else. One Suspense over the whole router put a
 * sidebar and a row of stat tiles in front of the sign-in page.
 */
function Shell() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <DashboardLayout />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <FormValidationStyler />
        {/* Inside the router, so it can navigate; outside every route, so
            the countdown survives moving between pages. */}
        <IdleSignOut />
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public site */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="news/:id" element={<NewsDetail />} />
          </Route>
          <Route
            path="/login"
            element={
              <Suspense fallback={<LoginSkeleton />}>
                <LoginPage />
              </Suspense>
            }
          />
          <Route path="/verify" element={<VerifyCertificate />} />

          {/* Resident portal */}
          <Route
            path="/portal"
            element={
              <ProtectedRoute residentOnly>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route index element={<PortalDashboard />} />
            <Route path="requests" element={<PortalRequests />} />
            <Route path="appointments" element={<PortalAppointments />} />
            {/*
              The old certificates page, folded into requests.

              A redirect rather than a deletion: the link is in notification
              emails already sent, and a resident following one should land
              on the list that now holds their certificate, not on nothing.
            */}
            <Route path="certificates" element={<Navigate to="/portal/requests" replace />} />
            <Route path="cases" element={<PortalCases />} />
            <Route path="announcements" element={<PortalAnnouncements />} />
            <Route path="assistant" element={<PortalAssistant />} />
            {/* Folded into the profile page; keep the old address working. */}
            <Route path="family" element={<Navigate to="/portal/profile" replace />} />
            <Route path="profile" element={<PortalProfile />} />
          </Route>

          {/* The only page every staff account shares — each office's own
              dashboard is chosen inside <Dashboard/> by office. */}
          <Route
            element={
              <ProtectedRoute staffOnly>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>

          {/* Resident registry — the Population Office (BPO) owns it. They are
              the only office that registers a person, so they are the only one
              that browses the registry. Every other office attaches a resident
              through the picker, which returns identity fields only. */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Population"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/residents" element={<ResidentList />} />
            {/* Their own list: relatives who live elsewhere are on the
                register but are not constituents, and mixing them into
                the purok roll makes both lists unusable. */}
            <Route path="/residents/non-residents" element={<NonResidentList />} />
            {/*
              The SAME pages, at an address that says what the record is.
              /residents/911 could not tell the sidebar, the breadcrumb or a
              shared link whether 911 lives here — the URL had to be read
              against the database to know. Each page redirects itself to
              whichever of the two it belongs on, so however you arrive, the
              address ends up true.
            */}
            <Route path="/residents/non-residents/:id" element={<ResidentDetail />} />
            <Route path="/residents/non-residents/:id/edit" element={<ResidentEdit />} />
            <Route path="/residents/create" element={<ResidentCreate />} />
            <Route path="/residents/:id" element={<ResidentDetail />} />
            <Route path="/residents/:id/edit" element={<ResidentEdit />} />
          </Route>

          {/* Counter verification — "is this person registered, and do they
              have a portal account?" The front desk runs this before filing a
              certificate, so it is NOT part of the registry group above. */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office", "Population"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/verify-records" element={<RecordsVerification />} />
          </Route>

          {/* Front desk — request intake and the window queue. Main Office
              only: the Lupon works its docket, not the service counter. */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office"]}
                allowedRoles={["Punong Barangay"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/services" element={<ServiceRequestList />} />
          </Route>

          {/* Appointments sit behind the front desk but not with the Clerk,
              whose remit is requests & certificates (mirrors deny_role:Clerk). */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office"]}
                allowedRoles={["Punong Barangay"]}
                deniedRoles={["Clerk"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/appointments" element={<AppointmentScheduler />} />
            {/* The secretary's own record, which the PB reads and adopts. */}
            <Route path="/sessions" element={<BarangaySessions />} />
          </Route>

          {/* Certificates & clearances — the clerk runs the counter end to
              end; the PB/Secretary only sign the printed paper. */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office"]}
                allowedRoles={["Punong Barangay"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/certificates" element={<CertificateList />} />
            <Route path="/certificates/report" element={<CertificateReport />} />
          </Route>

          {/* Live chat desk — the Secretary answers the website's chat widget.
              The Clerk is excluded: their remit is the service counter. */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office"]}
                allowedRoles={["Punong Barangay"]}
                deniedRoles={["Clerk"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/chat" element={<LiveChat />} />
          </Route>

          {/* Cross-office coordination and aggregated reporting — Main Office
              and the Punong Barangay. Every other desk coordinates and reports
              inside its own module (VAWC keeps a separate referral trail, the
              Health Station records referrals on its own forms, the Lupon
              routes through the CFA, Population has sectoral analytics), and
              the Clerk is limited to the front desk. */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office"]}
                allowedRoles={["Punong Barangay"]}
                deniedRoles={["Clerk"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
          </Route>

          {/* VAWC Office — isolated */}
          <Route
            element={
              <ProtectedRoute staffOnly allowedOffices={["VAWC"]}>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/vawc/cases" element={<VawcCasesList />} />
            <Route path="/vawc/cases/:id" element={<VawcCaseDetail />} />
            <Route path="/vawc/referrals" element={<VawcReferrals />} />
            <Route path="/vawc/followups" element={<VawcFollowups />} />
            <Route path="/vawc/documents" element={<VawcDocuments />} />
            <Route path="/vawc/reports" element={<VawcReports />} />
          </Route>

          {/* Lupon — Lupon office + Punong Barangay */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Lupon"]}
                allowedRoles={["Punong Barangay"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/lupon/cases" element={<LuponCasesList />} />
            <Route path="/lupon/cases/:id" element={<LuponCaseDetail />} />
            <Route path="/lupon/settlements" element={<LuponSettlements />} />
            <Route path="/lupon/reports" element={<LuponReports />} />
          </Route>

          {/*
            The hearing calendar, and only that.

            The barangay secretary takes the minutes at a mediation, so they
            reach the hearings without being given the docket behind them —
            which is why this is its own guard rather than a wider Lupon one.
          */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Lupon", "Main Office"]}
                allowedRoles={["Punong Barangay"]}
                deniedRoles={["Clerk"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/lupon/hearings" element={<LuponHearings />} />
          </Route>

          {/* Population Office */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Population"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/population/households" element={<HouseholdList />} />
            <Route path="/population/rbim" element={<RbimList />} />
            <Route path="/population/rbim/new" element={<RbimForm />} />
            <Route path="/population/rbim/:id" element={<RbimForm />} />
            <Route path="/population/events" element={<PopulationEvents />} />
            <Route path="/population/sectors" element={<SectorLists />} />
            <Route path="/population/accounts" element={<ResidentAccounts />} />
          </Route>

          {/* Health Station — isolated */}
          <Route
            element={
              <ProtectedRoute staffOnly allowedOffices={["Health Station"]}>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/health/visits" element={<PatientVisits />} />
            <Route path="/health/immunization" element={<Immunization />} />
            <Route path="/health/maternal-child" element={<MaternalChild />} />
          </Route>

          {/* Sangguniang Kabataan — manages public landing content */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["SK"]}
                allowedRoles={["Punong Barangay", "Admin"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/sk/hero-slides" element={<SkHeroSlides />} />
            <Route path="/sk/announcements" element={<AnnouncementsManage />} />
            <Route path="/sk/officials" element={<SkOfficials />} />
          </Route>

          {/* Service guides (AI KB) & administrative records — Main Office / PB / Admin
              (the Clerk is limited to requests & certificates) */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office"]}
                allowedRoles={["Punong Barangay"]}
                deniedRoles={["Clerk"]}
              >
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/records" element={<AdministrativeRecords />} />
          </Route>

          {/* System administration */}
          <Route
            element={
              <ProtectedRoute staffOnly allowedRoles={["Admin"]}>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/admin/users" element={<UserManagement />} />
            {/* The same register, asked a different question. Its own address
                so it can be linked to, bookmarked and put in the sidebar. */}
            <Route path="/admin/residents" element={<UserManagement kind="resident" />} />
            {/* Register entries, not accounts — see the page for why. */}
            <Route path="/admin/non-residents" element={<NonResidents />} />
          </Route>

          {/* Anything else — without this, an unknown address renders an
              empty document (the blank white screen). */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
