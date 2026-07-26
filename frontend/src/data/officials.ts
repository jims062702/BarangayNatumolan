import avatar1 from "../assets/images/avatar-1.svg";
import avatar2 from "../assets/images/avatar-2.svg";
import avatar3 from "../assets/images/avatar-3.svg";
import avatar4 from "../assets/images/avatar-4.svg";

export interface Official {
  id: number;
  position: string;
  name: string;
  term: string;
  photo: string;
}

const TERM = "2023 – 2026";

/**
 * Order matters — the Officials section renders:
 * [0] head, [1–4] first row, [5–7] second row, [8–9] secretary & treasurer.
 */
export const barangayOfficials: Official[] = [
  { id: 1, position: "Punong Barangay", name: "Hon. Ricardo M. Balagtas", term: TERM, photo: avatar1 },
  { id: 2, position: "Barangay Kagawad", name: "Hon. Maria Lourdes P. Santos", term: TERM, photo: avatar2 },
  { id: 3, position: "Barangay Kagawad", name: "Hon. Ernesto D. Villanueva", term: TERM, photo: avatar3 },
  { id: 4, position: "Barangay Kagawad", name: "Hon. Josefina T. Ramos", term: TERM, photo: avatar4 },
  { id: 5, position: "Barangay Kagawad", name: "Hon. Antonio C. Mabini", term: TERM, photo: avatar1 },
  { id: 6, position: "Barangay Kagawad", name: "Hon. Rowena S. Dagohoy", term: TERM, photo: avatar2 },
  { id: 7, position: "Barangay Kagawad", name: "Hon. Felipe G. Lacson", term: TERM, photo: avatar3 },
  { id: 8, position: "Barangay Kagawad", name: "Hon. Cristina B. Ocampo", term: TERM, photo: avatar4 },
  { id: 9, position: "Barangay Secretary", name: "Ms. Liezel A. Fernandez", term: TERM, photo: avatar2 },
  { id: 10, position: "Barangay Treasurer", name: "Mr. Nestor J. Padilla", term: TERM, photo: avatar3 },
];

export const skOfficials: Official[] = [
  { id: 1, position: "SK Chairperson", name: "Hon. Kyla Marie D. Torres", term: TERM, photo: avatar4 },
  { id: 2, position: "SK Kagawad", name: "Hon. John Rey M. Abella", term: TERM, photo: avatar1 },
  { id: 3, position: "SK Kagawad", name: "Hon. Princess Ann L. Uy", term: TERM, photo: avatar2 },
  { id: 4, position: "SK Kagawad", name: "Hon. Mark Joseph R. Salvador", term: TERM, photo: avatar3 },
  { id: 5, position: "SK Kagawad", name: "Hon. Angelica F. Bautista", term: TERM, photo: avatar4 },
  { id: 6, position: "SK Kagawad", name: "Hon. Carl Vincent T. Roa", term: TERM, photo: avatar1 },
  { id: 7, position: "SK Kagawad", name: "Hon. Shaira Mae G. Lim", term: TERM, photo: avatar2 },
  { id: 8, position: "SK Kagawad", name: "Hon. Daniel P. Cabrera", term: TERM, photo: avatar3 },
  { id: 9, position: "SK Secretary", name: "Ms. Nicole S. Enriquez", term: TERM, photo: avatar1 },
  { id: 10, position: "SK Treasurer", name: "Mr. Joshua K. Villar", term: TERM, photo: avatar4 },
];
