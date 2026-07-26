import { useAuth } from "../contexts/AuthContext";
import MainOfficeDashboard from "./dashboards/MainOfficeDashboard";
import VawcDashboard from "./dashboards/VawcDashboard";
import LuponDashboard from "./dashboards/LuponDashboard";
import PopulationOfficeDashboard from "./dashboards/PopulationOfficeDashboard";
import HealthStationDashboard from "./dashboards/HealthStationDashboard";
import SkDashboard from "./dashboards/SkDashboard";
import AdminDashboard from "./dashboards/AdminDashboard";

/**
 * Staff landing — every audience gets its own dashboard, per the MIS spec.
 * (Residents never reach this route; they land on /portal.)
 */
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  switch (user.office) {
    case "VAWC":
      return <VawcDashboard />;
    case "Lupon":
      return <LuponDashboard />;
    case "Population":
      return <PopulationOfficeDashboard />;
    case "Health Station":
      return <HealthStationDashboard />;
    case "SK":
      return <SkDashboard />;
    case "Admin":
      return <AdminDashboard />;
    default:
      // Main Office — includes the PB executive view.
      return <MainOfficeDashboard executive={user.role === "Punong Barangay"} />;
  }
}
