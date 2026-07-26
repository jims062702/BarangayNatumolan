import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
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
const PortalCertificates = lazy(() => import("./pages/portal/PortalCertificates"));
const PortalAnnouncements = lazy(() => import("./pages/portal/PortalAnnouncements"));
const PortalAssistant = lazy(() => import("./pages/portal/PortalAssistant"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));

// Shared core (staff)
const ResidentList = lazy(() => import("./pages/residents/ResidentList"));
const ResidentCreate = lazy(() => import("./pages/residents/ResidentCreate"));
const ResidentDetail = lazy(() => import("./pages/residents/ResidentDetail"));
const ServiceRequestList = lazy(() => import("./pages/services/ServiceRequestList"));
const CertificateList = lazy(() => import("./pages/services/CertificateList"));
const AppointmentScheduler = lazy(() => import("./pages/appointments/AppointmentScheduler"));

// VAWC Office
const VawcCasesList = lazy(() => import("./pages/vawc/VawcCasesList"));
const VawcCaseDetail = lazy(() => import("./pages/vawc/VawcCaseDetail"));
const VawcReports = lazy(() => import("./pages/vawc/VawcReports"));

// Lupon Tagapamayapa
const LuponCasesList = lazy(() => import("./pages/lupon/LuponCasesList"));
const LuponCaseDetail = lazy(() => import("./pages/lupon/LuponCaseDetail"));

// Population Office
const HouseholdList = lazy(() => import("./pages/population/HouseholdList"));
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
const AnnouncementsManage = lazy(() => import("./pages/manage/AnnouncementsManage"));
const ServiceGuidesManage = lazy(() => import("./pages/manage/ServiceGuidesManage"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));

/** Brand spinner shown for the instant a lazy page chunk downloads. */
function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary">
      <div
        aria-label="Loading"
        className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public site */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="news/:id" element={<NewsDetail />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<VerifyCertificate />} />

          {/* Resident portal */}
          <Route
            path="/portal"
            element={
              <ProtectedRoute residentOnly>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PortalDashboard />} />
            <Route path="requests" element={<PortalRequests />} />
            <Route path="appointments" element={<PortalAppointments />} />
            <Route path="certificates" element={<PortalCertificates />} />
            <Route path="announcements" element={<PortalAnnouncements />} />
            <Route path="assistant" element={<PortalAssistant />} />
            <Route path="profile" element={<PortalProfile />} />
          </Route>

          {/* Staff — shared core (any office) */}
          <Route
            element={
              <ProtectedRoute staffOnly>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/residents" element={<ResidentList />} />
            <Route path="/residents/create" element={<ResidentCreate />} />
            <Route path="/residents/:id" element={<ResidentDetail />} />
            <Route path="/services" element={<ServiceRequestList />} />
            <Route path="/certificates" element={<CertificateList />} />
            <Route path="/appointments" element={<AppointmentScheduler />} />
          </Route>

          {/* VAWC Office — isolated */}
          <Route
            element={
              <ProtectedRoute staffOnly allowedOffices={["VAWC"]}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/vawc/cases" element={<VawcCasesList />} />
            <Route path="/vawc/cases/:id" element={<VawcCaseDetail />} />
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
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/lupon/cases" element={<LuponCasesList />} />
            <Route path="/lupon/cases/:id" element={<LuponCaseDetail />} />
          </Route>

          {/* Population Office */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Population"]}
                allowedRoles={["Admin"]}
              >
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/population/households" element={<HouseholdList />} />
            <Route path="/population/events" element={<PopulationEvents />} />
            <Route path="/population/sectors" element={<SectorLists />} />
            <Route path="/population/accounts" element={<ResidentAccounts />} />
          </Route>

          {/* Health Station — isolated */}
          <Route
            element={
              <ProtectedRoute staffOnly allowedOffices={["Health Station"]}>
                <DashboardLayout />
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
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/sk/hero-slides" element={<SkHeroSlides />} />
            <Route path="/sk/announcements" element={<AnnouncementsManage />} />
            <Route path="/sk/officials" element={<SkOfficials />} />
          </Route>

          {/* Service guides (AI KB) — Main Office / PB / Admin */}
          <Route
            element={
              <ProtectedRoute
                staffOnly
                allowedOffices={["Main Office"]}
                allowedRoles={["Punong Barangay", "Admin"]}
              >
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/manage/service-guides" element={<ServiceGuidesManage />} />
          </Route>

          {/* System administration */}
          <Route
            element={
              <ProtectedRoute staffOnly allowedRoles={["Admin"]}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin/users" element={<UserManagement />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
