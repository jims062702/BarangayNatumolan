import type { IconType } from "react-icons";
import {
  FaFileAlt,
  FaStamp,
  FaHome,
  FaHandHoldingHeart,
  FaBriefcase,
  FaFileSignature,
  FaBook,
  FaComments,
  FaConciergeBell,
} from "react-icons/fa";

export interface Service {
  id: number;
  name: string;
  description: string;
  icon: IconType;
}

export const services: Service[] = [
  {
    id: 1,
    name: "Barangay Certificate",
    description:
      "General-purpose certification issued to residents for employment, school, and other legal requirements.",
    icon: FaFileAlt,
  },
  {
    id: 2,
    name: "Barangay Clearance",
    description:
      "Certifies that a resident has no pending case or derogatory record within the barangay.",
    icon: FaStamp,
  },
  {
    id: 3,
    name: "Certificate of Residency",
    description:
      "Official proof that an individual is a bona fide resident of Barangay Natumolan.",
    icon: FaHome,
  },
  {
    id: 4,
    name: "Certificate of Indigency",
    description:
      "Issued to qualified low-income residents for medical, educational, and legal assistance.",
    icon: FaHandHoldingHeart,
  },
  {
    id: 5,
    name: "Business Clearance",
    description:
      "A requirement for new and renewing businesses operating within the barangay's jurisdiction.",
    icon: FaBriefcase,
  },
  {
    id: 6,
    name: "Barangay Permit",
    description:
      "Permits for events, construction, and other activities conducted within the barangay.",
    icon: FaFileSignature,
  },
  {
    id: 7,
    name: "Blotter Report",
    description:
      "Official recording of incidents and disputes for documentation and proper resolution.",
    icon: FaBook,
  },
  {
    id: 8,
    name: "Complaints",
    description:
      "File complaints and grievances for mediation through the Lupon Tagapamayapa.",
    icon: FaComments,
  },
  {
    id: 9,
    name: "Other Barangay Services",
    description:
      "Health services, youth programs, community activities, and more assistance for residents.",
    icon: FaConciergeBell,
  },
];
