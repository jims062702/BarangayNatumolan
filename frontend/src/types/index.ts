/** Shared API models — mirror the Laravel backend responses. */

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  office: string;
  is_active?: boolean;
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
}

export interface Resident {
  id: number;
  resident_number: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  civil_status?: string | null;
  occupation?: string | null;
  contact_number?: string | null;
  email?: string | null;
  household_id?: number | null;
  residency_status?: string;
  zone_purok?: string | null;
  demographic_classification?: string | null;
  is_active?: boolean;
  full_name?: string;
  household?: Household | null;
  sectors?: ResidentSector[];
  service_requests?: ServiceRequest[];
  certificates?: Certificate[];
  /** Portal login account, if one has been issued to this resident. */
  account?: { id: number; email: string; is_active: boolean } | null;
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
  certificate_type: string;
  purpose?: string | null;
  fee_amount: string | number;
  is_exempt: boolean;
  exemption_reason?: string | null;
  status: string;
  rejection_reason?: string | null;
  reference_number: string;
  approved_at?: string | null;
  released_at?: string | null;
  reprint_count: number;
  created_at?: string;
  resident?: Resident | null;
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
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  category: string;
  location?: string | null;
  event_at?: string | null;
  event_time?: string | null;
  image_path?: string | null;
  image_url?: string | null;
  is_published: boolean;
  published_at?: string | null;
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
  violence_type: string;
  relationship_to_offender?: string | null;
  children_involved: boolean;
  children_count: number;
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
}

export interface VawcFollowup {
  id: number;
  followup_date: string;
  followup_type: string;
  safety_status: string;
  bpo_compliance: string;
  notes?: string | null;
  next_followup_date?: string | null;
  closure_recommended: boolean;
  recorder?: User | null;
}

export interface VawcDocument {
  id: number;
  document_type: string;
  title: string;
  description?: string | null;
  file_reference?: string | null;
  uploader?: User | null;
  created_at?: string;
}

export interface LuponCase {
  id: number;
  case_number: string;
  case_title: string;
  case_classification: string;
  complainant_id: number;
  respondent_id: number;
  jurisdiction_status: string;
  rejection_reason?: string | null;
  current_stage: string;
  date_filed: string;
  date_resolved?: string | null;
  notes?: string | null;
  complainant?: Resident | null;
  respondent?: Resident | null;
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
  complainant_present?: boolean | null;
  respondent_present?: boolean | null;
  proceedings_notes?: string | null;
  outcome?: string | null;
  lupon_case?: Partial<LuponCase> | null;
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
  cba_issued: boolean;
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
