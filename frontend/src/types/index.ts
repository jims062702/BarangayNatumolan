/** Shared API models — mirror the Laravel backend responses. */

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  office: string;
  is_active?: boolean;
  /**
   * Null until the account holder has entered the code emailed to them.
   * Distinct from `is_active`, which is the office switching a login off.
   */
  activated_at?: string | null;
  resident_id?: number | null;
  resident?: Resident | null;
}

export interface Household {
  id: number;
  household_number: string;
  zone_purok?: string | null;
  street_address?: string | null;
  house_type?: string | null;
  household_head_id?: number | null;
  residents?: Resident[];
  head?: Resident | null;
}

export interface ResidentSector {
  id: number;
  resident_id: number;
  sector_type: string;
  enrolled_date?: string | null;
  is_active: boolean;
  /**
   * The card behind the tag. Solo Parent (RA 8972) and PWD are registrations
   * granted by an office, not judgements a clerk makes — a tag with nothing
   * behind it is how a benefit reaches the wrong household.
   */
  reference_no?: string | null;
  issued_on?: string | null;
  valid_until?: string | null;
  note?: string | null;
}

/**
 * One person on somebody's family card. Parents and children carry a `pivot`
 * holding the relationship label the clerk chose (Mother, Father, Son...).
 */
export interface FamilyMember {
  id: number;
  resident_number?: string;
  record_type?: string;
  address?: string | null;
  contact_number?: string | null;
  life_status?: string;
  date_of_death?: string | null;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  suffix?: string | null;
  full_name?: string;
  gender?: string | null;
  birthdate?: string | null;
  age?: number | null;
  zone_purok?: string | null;
  is_active?: boolean;
  relationship?: string | null;
  pivot?: { relationship?: string | null } | null;
  /**
   * Present only on a guardian or a ward. Care is not descent, so it carries
   * its own facts: why the parents are not raising them, since when, and
   * whether this is the person the barangay rings first.
   */
  guardianship?: {
    id: number;
    reason?: string | null;
    started_on?: string | null;
    is_primary?: boolean;
    note?: string | null;
  } | null;
}

/** A guardianship that has ended. Kept — a child's care history is asked about. */
export interface PastGuardian {
  id: number;
  guardian_id: number;
  name?: string | null;
  relation?: string | null;
  reason?: string | null;
  started_on?: string | null;
  ended_on?: string | null;
  end_reason?: string | null;
}

/**
 * The one sentence about who is raising this person.
 *
 * "missing" is the case this whole feature exists for: a child registered
 * here whose mother and father are both on the register as living somewhere
 * else, with nobody recorded as looking after them.
 */
export interface CareNote {
  kind: "recorded" | "missing";
  text: string;
}

/** The whole tree around one resident, as the family endpoints return it. */
export interface Family {
  parents: FamilyMember[];
  grandparents: FamilyMember[];
  spouse?: FamilyMember | null;
  children: FamilyMember[];
  /** All four of these are DERIVED from the parent/child links, never stored. */
  siblings: FamilyMember[];
  aunts_uncles?: FamilyMember[];
  cousins?: FamilyMember[];
  self?: FamilyMember | null;
  /** Care, not descent — nothing on the tree is derived from these. */
  guardians?: FamilyMember[];
  wards?: FamilyMember[];
  past_guardians?: PastGuardian[];
  care_note?: CareNote | null;
  /**
   * How the parents' marriage ended. Present ONLY when the family agreed the
   * children may see it — the reason is always recorded on the parents'
   * records, but consent governs who it is shown to.
   */
  parents_note?: {
    end_reason?: string | null;
    ended_on?: string | null;
    deceased_name?: string | null;
  } | null;
}

export interface Resident {
  id: number;
  resident_number: string;
  /**
   * "Resident" or "Non-resident". A non-resident is a relative who lives
   * outside the barangay: on the register so the family can be recorded, but
   * not a constituent — no portal account, not in the population count.
   */
  record_type?: string;
  /** Where a non-resident lives; residents get theirs from the household. */
  address?: string | null;
  /**
   * "Alive" or "Deceased". Separate from `is_active`, which only says whether
   * the record is in use — a duplicate and a person who has died are both
   * inactive, and the office has to tell them apart.
   */
  life_status?: string;
  date_of_death?: string | null;
  life_status_note?: string | null;
  first_name: string;
  middle_name?: string | null;
  /**
   * The mother's surname before marriage. In Philippine naming this IS the
   * middle name, and it is what tells two residents apart when their name
   * and birthday are identical.
   */
  mother_maiden_name?: string | null;
  /*
   * What this person is to the head of their household — Head, Spouse, Son,
   * Daughter — worked out from the family links and sent with the household
   * list. Blank where the links do not say: a house holds cousins, boarders
   * and grandparents, and the register does not guess.
   */
  relation_to_head?: string | null;
  last_name: string;
  suffix?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  birth_place?: string | null;
  civil_status?: string | null;
  occupation?: string | null;
  contact_number?: string | null;
  email?: string | null;
  household_id?: number | null;
  residency_status?: string;
  zone_purok?: string | null;
  length_of_residence_years?: number | null;
  educational_attainment?: string | null;
  demographic_classification?: string | null;
  is_active?: boolean;
  full_name?: string;
  household?: Household | null;
  sectors?: ResidentSector[];
  service_requests?: ServiceRequest[];
  certificates?: Certificate[];
  /** Portal login account. Issued automatically at registration. */
  account?: { id: number; email: string; is_active: boolean; activated_at?: string | null } | null;
  /**
   * Set when this record was folded into another as a duplicate. A merged
   * record is a tombstone: kept so its certificates stay verifiable, but it
   * is nobody's resident any more.
   */
  merged_into_id?: number | null;
  /** Marriage — a mutual link, so both records point at each other. */
  spouse_id?: number | null;
  spouse?: FamilyMember | null;
  /**
   * Wife / Husband / Partner — decided by the server, because whether a
   * union is a marriage or a live-in partnership is not something the sex
   * of the two people can tell you.
   */
  spouse_label?: string | null;
  parents?: FamilyMember[];
  children?: FamilyMember[];
  /** Derived from the parent/child links, so appended, never stored. */
  grandparents?: FamilyMember[];
  siblings?: FamilyMember[];
  aunts_uncles?: FamilyMember[];
  cousins?: FamilyMember[];
  guardians?: FamilyMember[];
  wards?: FamilyMember[];
  past_guardians?: PastGuardian[];
  care_note?: CareNote | null;
  parents_note?: {
    end_reason?: string | null;
    ended_on?: string | null;
    deceased_name?: string | null;
  } | null;
  /** Returned once, by the register/add-relative endpoints. */
  portal_account?: {
    created: boolean;
    email?: string | null;
    password?: string | null;
    reason?: string | null;
  };
  family_notes?: string[];
}

export interface ServiceRequest {
  id: number;
  request_number: string;
  resident_id?: number | null;
  service_type: string;
  office: string;
  request_type: string;
  status: string;
  purpose?: string | null;
  assigned_to?: number | null;
  completed_at?: string | null;
  created_at?: string;
  resident?: Resident | null;
  assigned_user?: User | null;
  certificate?: Certificate | null;
  appointments?: Appointment[];
}

export interface Certificate {
  id: number;
  certificate_number: string;
  resident_id: number;
  service_request_id: number;
  /**
   * Just enough of the request behind it to say how it was asked for.
   *
   * Sent with the list because it decides what the clerk does with a
   * finished certificate: somebody who walked in expects a call, and
   * somebody who asked online may never open their portal to learn it is
   * ready.
   */
  service_request?: { id: number; request_type: "Walk-in" | "Online" } | null;
  certificate_type: string;
  purpose?: string | null;
  /** Documentary requirements and whether each was presented at filing. */
  requirements_checklist?: { item: string; presented: boolean }[] | null;
  fee_amount: string | number;
  is_exempt: boolean;
  exemption_reason?: string | null;
  /**
   * Pending | Processing | Printed | For Signature | Ready to Claim |
   * Released, plus Cancelled. There is no approval state: the clerk moves the
   * document, nobody decides on it.
   */
  status: string;
  cancel_reason?: string | null;
  reference_number: string;
  processed_at?: string | null;
  printed_at?: string | null;
  signed_at?: string | null;
  ready_at?: string | null;
  claimed_at?: string | null;
  released_at?: string | null;
  reprint_count: number;
  created_at?: string;
  resident?: Resident | null;
  processor?: Partial<User> | null;
  signer?: Partial<User> | null;
  releaser?: Partial<User> | null;
}

/** One live-agent conversation, as the Secretary's desk sees it. */
export interface ChatConversation {
  id: number;
  visitor_name: string;
  is_resident: boolean;
  resident_id?: number | null;
  guest_email?: string | null;
  guest_contact?: string | null;
  topic?: string | null;
  status: "Waiting" | "Active" | "Closed";
  assigned_to?: number | null;
  agent_name?: string | null;
  unread: number;
  last_message_at?: string | null;
  created_at?: string;
  closed_at?: string | null;
}

export interface ChatMessage {
  id: number;
  /** `system` lines narrate the conversation (joined, closed, ...). */
  sender: "visitor" | "agent" | "system";
  sender_name?: string | null;
  body: string;
  created_at: string;
}

export interface Appointment {
  id: number;
  appointment_number: string;
  service_request_id?: number | null;
  resident_id: number;
  office: string;
  scheduled_datetime: string;
  status: string;
  notes?: string | null;
  cancellation_reason?: string | null;
  resident?: Resident | null;

  /*
   * What actually happened, as against what was booked.
   *
   * Separate from `status`: an appointment can be Completed with nobody
   * present — the office did its part and the resident did not come — and
   * one field cannot say both. Written by the secretary, so every one of
   * these is absent until they have.
   */
  attendance?: "Awaiting" | "Present" | "Absent" | "Late" | null;
  /** Times on the booked day, "HH:mm" or "HH:mm:ss" depending on the driver. */
  started_at?: string | null;
  ended_at?: string | null;
  minutes?: string | null;
  minuted_at?: string | null;
}

/**
 * A post on News & Announcements.
 *
 * One row shape for five kinds of post — see lib/postKinds. Which of the
 * optional fields are filled in depends on the kind, and the server clears
 * the ones that do not belong to it, so a post changed from Event to
 * Announcement cannot keep showing a stale venue.
 */
export interface Announcement {
  id: number;
  title: string;
  body: string;
  /** One of the five kinds. Typed loosely because the server owns the list. */
  category: string;
  /** The byline the barangay puts its name to — "SK Secretary". */
  author_name?: string | null;
  /** What to actually print: author_name, or the account that posted it. */
  byline?: string | null;
  /** One line for the card, so a card is not a truncated essay. */
  excerpt?: string | null;
  status: "Draft" | "Published" | "Archived";
  image_path?: string | null;
  image_url?: string | null;
  published_at?: string | null;
  sort_order?: number;

  /** Event, Activity and Program all use a venue. */
  location?: string | null;

  /** Event. */
  event_at?: string | null;
  event_time?: string | null;
  organizer?: string | null;
  contact_info?: string | null;
  registration_deadline?: string | null;

  /** Activity. */
  completed_at?: string | null;
  participants?: string | null;

  /** Advisory. */
  effective_at?: string | null;
  expires_at?: string | null;
  urgency?: string | null;
}

export interface AppNotification {
  id: number;
  notification_type: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface VawcCase {
  id: number;
  case_code: string;
  survivor_id: number;
  /**
   * How urgent the case is, in words. Null means nobody has judged it yet —
   * which is its own state, and not the same as safe.
   *
   * Set at intake and re-stated by every follow-up, so the docket shows what
   * was last seen rather than what was first assumed.
   */
  risk_level?: "Critical" | "High" | "Medium" | "Low" | null;
  risk_assessed_at?: string | null;
  /** How the complaint reached the barangay. */
  reporting_channel?: string | null;
  /** Sent with the list: the soonest visit due, and the last one made. */
  next_followup_date?: string | null;
  last_followup_date?: string | null;
  /** Who brought the complaint, when that is not the survivor herself. */
  reported_by_name?: string | null;
  reported_by_relationship?: string | null;
  reported_by_contact?: string | null;
  violence_type: string;
  relationship_to_offender?: string | null;
  children_involved: boolean;
  children_count: number;
  /** Children/dependents involved, linked to their registry records. */
  dependents?: Resident[];
  children_details?: string | null;
  immediate_needs?: string | null;
  previous_incidents_count: number;
  status: string;
  confidential_notes?: string | null;
  report_date: string;
  survivor?: Resident | null;
  officer?: User | null;
  incidents?: VawcIncident[];
  referrals?: VawcReferral[];
  followups?: VawcFollowup[];
  documents?: VawcDocument[];
}

export interface VawcIncident {
  id: number;
  incident_narrative: string;
  injury_documentation?: string | null;
  medical_certificate_reference?: string | null;
  police_report_reference?: string | null;
  protection_order_filed: boolean;
  created_at?: string;
}

/**
 * `vawc_case` is present on the desk-wide worklists (referrals, follow-ups,
 * documents) and carries the case CODE only — never the survivor's name.
 */
export interface VawcCaseRef {
  id: number;
  case_code: string;
  violence_type?: string;
  status?: string;
}

export interface VawcReferral {
  id: number;
  referral_agency: string;
  receiving_person?: string | null;
  services_requested: string;
  referral_date: string;
  acknowledgment_date?: string | null;
  outcome?: string | null;
  followup_schedule?: string | null;
  is_completed: boolean;
  vawc_case?: VawcCaseRef | null;
}

export interface VawcFollowup {
  id: number;
  followup_date: string;
  followup_type: string;
  safety_status: string;
  bpo_compliance: string;
  referral_attended?: boolean | null;
  services_received?: string | null;
  notes?: string | null;
  next_followup_date?: string | null;
  closure_recommended: boolean;
  recorder?: User | null;
  vawc_case?: VawcCaseRef | null;
}

export interface VawcDocument {
  id: number;
  document_type: string;
  title: string;
  description?: string | null;
  file_reference?: string | null;
  uploader?: User | null;
  created_at?: string;
  vawc_case?: VawcCaseRef | null;
}

/** One entry in the confidential access trail. */
export interface VawcAccessLog {
  id: number;
  action: string;
  detail?: string | null;
  created_at: string;
  user?: Partial<User> | null;
  vawc_case?: VawcCaseRef | null;
}

export interface LuponCase {
  id: number;
  case_number: string;
  case_title: string;
  case_classification: string;
  /** Null when the complainant lives outside the barangay. */
  complainant_id?: number | null;
  complainant_name?: string | null;
  complainant_address?: string | null;
  complainant_contact?: string | null;
  /** Server-computed: the complainant's name whichever kind they are. */
  complainant_display_name?: string;
  complainant_is_resident?: boolean;
  /*
   * Read from the register for a resident, from the case for somebody
   * outside it — so the page never has to ask which kind of complainant
   * it is holding.
   */
  complainant_display_address?: string | null;
  complainant_display_contact?: string | null;
  complainant_reference?: string | null;
  jurisdiction_status: string;
  rejection_reason?: string | null;
  current_stage: string;
  date_filed: string;
  date_resolved?: string | null;
  notes?: string | null;
  complainant?: Resident | null;
  /** Everyone complained against — a KP case may name more than one. */
  respondents?: Resident[];
  /** Server-computed: their names joined, for lists and search. */
  respondent_display_names?: string;
  complaint?: LuponComplaint | null;
  hearings?: LuponHearing[];
  settlement?: LuponSettlement | null;
}

export interface LuponComplaint {
  id: number;
  complaint_narrative: string;
  date_of_occurrence: string;
  place_of_occurrence: string;
  relationship_nature: string;
}

export interface LuponHearing {
  id: number;
  hearing_type: string;
  scheduled_at: string;
  status: string;
  summons_issued: boolean;
  /** Proof of service — required before a party can be defaulted. */
  summons_served_date?: string | null;
  complainant_present?: boolean | null;
  respondent_present?: boolean | null;
  attendance_notes?: string | null;
  proceedings_notes?: string | null;
  outcome?: string | null;
  recorder?: Partial<User> | null;
  lupon_case?: Partial<LuponCase> | null;
}

/** One prescribed DILG KP form, with whether this case can produce it. */
export interface KpForm {
  code: string;
  name: string;
  available: boolean;
  requires: string;
}

export interface KpFormPayload {
  case: LuponCase;
  barangay: { name: string; municipality: string; province: string };
  next_hearing?: LuponHearing | null;
  forms: KpForm[];
}

export interface LuponSettlement {
  id: number;
  settlement_type: string;
  terms: string;
  date_agreed: string;
  repudiation_deadline: string;
  status: string;
  compliance_deadline?: string | null;
  compliance_notes?: string | null;
  cfa_issued: boolean;
  cfa_issued_at?: string | null;
  cba_issued: boolean;
  cba_issued_at?: string | null;
  closed_at?: string | null;
  recorder?: Partial<User> | null;
  lupon_case?: Partial<LuponCase> | null;
}

export interface PopulationEvent {
  id: number;
  event_type: string;
  event_date: string;
  description?: string | null;
  verification_status: string;
  resident?: Resident | null;
  recorder?: User | null;
}

export interface HealthVisit {
  id: number;
  patient_id: number;
  visit_date: string;
  visit_reason: string;
  temperature?: number | string | null;
  blood_pressure?: string | null;
  heart_rate?: number | null;
  symptoms?: string | null;
  treatment_advice?: string | null;
  followup_schedule?: string | null;
  referral_recommended: boolean;
  patient?: Resident | null;
  provider?: User | null;
}

export interface ImmunizationRecord {
  id: number;
  child_id: number;
  vaccine_name: string;
  vaccination_date: string;
  scheduled_date?: string | null;
  status: string;
  child?: Resident | null;
}

export interface MaternalRecord {
  id: number;
  mother_id: number;
  pregnancy_registration_date: string;
  expected_delivery_date?: string | null;
  prenatal_visits_count: number;
  risk_indicators?: string | null;
  status: string;
  mother?: Resident | null;
}

export interface ChildHealthRecord {
  id: number;
  child_id: number;
  birth_date: string;
  current_weight?: number | string | null;
  current_height?: number | string | null;
  nutritional_status?: string | null;
  child?: Resident | null;
}

export interface CdcEnrollment {
  id: number;
  child_id: number;
  school_year: string;
  enrollment_date: string;
  guardian_name: string;
  guardian_contact?: string | null;
  session: string;
  status: string;
  child?: Resident | null;
}

export interface HeroSlide {
  id: number;
  title?: string | null;
  subtitle?: string | null;
  image_path?: string | null;
  image_url?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Official {
  id: number;
  group: "Barangay" | "SK";
  position: string;
  name: string;
  term?: string | null;
  photo_path?: string | null;
  photo_url?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ServiceGuide {
  id: number;
  office: string;
  service_name: string;
  description: string;
  requirements?: string | null;
  fees?: string | null;
  schedule?: string | null;
  keywords?: string | null;
  is_active: boolean;
}

/**
 * Cross-office / external-agency referral. VAWC referrals are a separate
 * type (`VawcReferral`) and never appear in this list.
 */
export interface Referral {
  id: number;
  referral_number: string;
  resident_id: number;
  service_request_id?: number | null;
  referring_office: string;
  receiving_office: string;
  referral_reason: string;
  required_information?: string | null;
  referral_date: string;
  acknowledgment_date?: string | null;
  services_provided?: string | null;
  referral_outcome?: string | null;
  followup_date?: string | null;
  status: string;
  resident?: Resident | null;
  service_request?: Partial<ServiceRequest> | null;
}

/** One walk-in number on an office's queue board. */
export interface QueueEntry {
  id: number;
  queue_number: string;
  service_request_id: number;
  resident_id: number;
  office: string;
  status: string;
  queue_time: string;
  called_time?: string | null;
  served_time?: string | null;
  completed_time?: string | null;
  wait_time_minutes?: number | null;
  notes?: string | null;
  resident?: Resident | null;
  service_request?: Partial<ServiceRequest> | null;
  server?: Partial<User> | null;
}

export interface QueueSummary {
  waiting: number;
  called: number;
  serving: number;
  completed: number;
  absent: number;
  now_serving?: string | null;
  average_wait_minutes: number;
}

/** Ordinance, resolution, minutes… — the barangay's document archive. */
export interface AdministrativeRecord {
  id: number;
  document_type: string;
  document_number: string;
  document_title: string;
  document_date: string;
  document_content: string;
  summary?: string | null;
  file_reference?: string | null;
  is_archived: boolean;
  approved_at?: string | null;
  creator?: Partial<User> | null;
  approver?: Partial<User> | null;
}
