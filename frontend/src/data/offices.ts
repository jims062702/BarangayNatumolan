import office1 from "../assets/images/office-1.svg";
import office2 from "../assets/images/office-2.svg";
import office3 from "../assets/images/office-3.svg";
import office4 from "../assets/images/office-4.svg";
import office6 from "../assets/images/office-6.svg";

export interface Office {
  id: number;
  name: string;
  personnel: string;
  position: string;
  description: string;
  image: string;
}

export const offices: Office[] = [
  {
    id: 1,
    name: "Barangay Main Office",
    personnel: "Hon. Ricardo M. Balagtas",
    position: "Punong Barangay",
    description:
      "The center of barangay governance — handles certificates, clearances, permits, and all official transactions of Barangay Natumolan.",
    image: office1,
  },
  {
    id: 2,
    name: "VAWC Desk",
    personnel: "Hon. Maria Lourdes P. Santos",
    position: "VAWC Desk Officer",
    description:
      "The Violence Against Women and Children Desk provides immediate, confidential assistance and protection to women and children in need.",
    image: office2,
  },
  {
    id: 3,
    name: "Lupon Tagapamayapa",
    personnel: "Mr. Ernesto D. Villanueva",
    position: "Lupon Secretary",
    description:
      "The barangay justice committee that mediates and amicably settles disputes between residents through the Katarungang Pambarangay.",
    image: office3,
  },
  {
    id: 4,
    name: "Barangay Health Station",
    personnel: "Ms. Angelica R. Cruz, RM",
    position: "Rural Health Midwife",
    description:
      "Provides primary health care services — maternal care, immunization, health education, and free basic medicines for residents.",
    image: office4,
  },
  {
    id: 6,
    name: "Barangay Population Office (BPO)",
    personnel: "Mr. Allan T. Mercado",
    position: "Population Program Worker",
    description:
      "Manages the barangay's population records, census coordination, and responsible parenthood and family planning programs.",
    image: office6,
  },
];
