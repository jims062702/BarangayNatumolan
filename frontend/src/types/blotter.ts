/** One person named in a blotter entry — a subject or a witness. */
export interface BlotterPerson {
  id: number;
  role: "Subject" | "Witness";
  resident_id?: number | null;
  name: string;
  address?: string | null;
  contact?: string | null;
}

/**
 * One incident reported at the desk.
 *
 * The list view carries the summary fields; `show` adds the narrative, the
 * people and the action notes.
 */
export interface Blotter {
  id: number;
  blotter_number: string;
  recorded_at?: string | null;
  recorded_by?: string | null;
  incident_at?: string | null;
  place_of_incident: string;
  incident_type: string;
  reporter: string;
  reporter_id?: number | null;
  action_taken: string;
  status: "Open" | "Closed";
  closed_at?: string | null;
  people_count?: number;
  /* Detail only. */
  narrative?: string;
  action_notes?: string | null;
  reporter_address?: string | null;
  reporter_contact?: string | null;
  people?: BlotterPerson[];
  lupon_case?: { id: number; case_number: string; stage: string } | null;
}

export const BLOTTER_TYPES = [
  "Physical Altercation",
  "Verbal Abuse or Threat",
  "Theft",
  "Property Damage",
  "Noise or Disturbance",
  "Trespassing",
  "Missing Person",
  "Accident",
  "Animal Complaint",
  "Drug-related",
  "Other",
];

export const BLOTTER_ACTIONS = [
  "Recorded only",
  "Advised the parties",
  "Settled at the desk",
  "Referred to Lupon",
  "Referred to PNP",
  "Referred to other agency",
  "For monitoring",
];

/** A resident's own case, as the portal shows it. */
export interface PortalKpCase {
  case_number: string;
  title: string;
  classification: string;
  my_role: "Complainant" | "Respondent";
  stage: string;
  date_filed?: string | null;
  date_resolved?: string | null;
  occurred_on?: string | null;
  place?: string | null;
  other_party?: string | null;
  next_hearing?: {
    type: string;
    scheduled_at?: string | null;
    summons_served?: string | null;
  } | null;
  hearings_held: number;
  settlement?: {
    type: string;
    agreed_on?: string | null;
    status: string;
    certificate_to_file_action: boolean;
  } | null;
}

/** A blotter entry as the resident sees it — no narrative, by design. */
export interface PortalBlotter {
  blotter_number: string;
  recorded_at?: string | null;
  incident_at?: string | null;
  incident_type: string;
  place: string;
  my_role: string;
  action_taken: string;
  status: string;
}
