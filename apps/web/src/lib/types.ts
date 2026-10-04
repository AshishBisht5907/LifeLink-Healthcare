// These types are derived directly from live responses captured against
// the running backend (see /tmp/api_samples/*.json during development),
// not guessed from serializer source alone.

export type Role = 'PATIENT' | 'FAMILY' | 'HOSPITAL_STAFF' | 'HOSPITAL_MANAGEMENT' | 'HOSPITAL_ADMIN';

export interface StaffProfileSummary {
  hospital: string;
  hospital_id: string;
  department: string | null;
  department_type: string | null;
  job_title: string;
  employee_id: string;
}

export interface Me {
  id: string;
  username: string;
  phone: string | null;
  email: string;
  role: Role;
  mfa_enabled: boolean;
  staff_profile: StaffProfileSummary | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export type VerificationStatus = 'SELF_REPORTED' | 'VERIFIED' | 'PENDING_VERIFICATION' | 'CONFLICT' | 'SYSTEM_GENERATED';
export type DataSource = 'SELF_REPORTED' | 'FAMILY_REPORTED' | 'HOSPITAL_ENTERED' | 'DOCTOR_ENTERED' | 'DOCUMENT_UPLOAD' | 'SYSTEM_GENERATED' | 'AI_GENERATED';

export interface Allergy {
  id: string;
  patient: string;
  substance: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  source: DataSource;
  verification_status: VerificationStatus;
  recorded_at: string;
}

export interface MedicalHistoryEntry {
  id: string;
  patient: string;
  event_type: 'DIAGNOSIS' | 'CHRONIC_CONDITION' | 'SURGERY' | 'ADMISSION_SUMMARY' | 'LAB_RESULT' | 'IMAGING_RESULT';
  description: string;
  event_date: string;
  source: DataSource;
  verification_status: VerificationStatus;
  originating_hospital: string | null;
  originating_admission: string | null;
  created_at: string;
}

export interface Medication {
  id: string;
  patient: string;
  admission: string | null;
  name: string;
  dosage: string;
  frequency: string;
  start_date: string;
  stop_date: string | null;
  prescribing_doctor: string | null;
  status: 'ACTIVE' | 'STOPPED' | 'COMPLETED';
  source: DataSource;
  created_at: string;
}

export interface EmergencyContact {
  id: string;
  patient: string;
  name: string;
  relationship: string;
  phone: string;
  is_primary: boolean;
}

export interface PatientListItem {
  id: string;
  lifelink_patient_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string;
  phone: string;
  is_unclaimed: boolean;
}

export interface PatientDetail {
  id: string;
  lifelink_patient_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string;
  phone: string;
  blood_group: string;
  blood_group_verification: VerificationStatus;
  is_unclaimed: boolean;
  allergies: Allergy[];
  history_entries: MedicalHistoryEntry[];
  medications: Medication[];
  emergency_contacts: EmergencyContact[];
  created_at: string;
  updated_at: string;
}

export interface LiveStatusItem {
  id: string;
  type: string;
  status: string;
  priority: string;
  department: string | null;
  created_at: string;
}

export interface FamilyRelationship {
  id: string;
  patient: string;
  family_user: string;
  family_username: string;
  relationship_type: string;
  access_level: 'FULL_REPRESENTATIVE' | 'UPDATES_ONLY' | 'LIMITED';
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------

export interface AdmissionListItem {
  id: string;
  admission_number: string;
  patient: string;
  patient_name: string;
  hospital: string;
  hospital_name: string;
  status: 'ACTIVE' | 'DISCHARGED' | 'TRANSFERRED';
  admitted_at: string;
  discharged_at: string | null;
}

export interface DoctorNote {
  id: string;
  admission: string;
  author: string;
  author_username: string;
  content: string;
  created_at: string;
}

export interface NursingNote {
  id: string;
  admission: string;
  author: string;
  author_username: string;
  content: string;
  created_at: string;
}

export interface AdmissionDetail extends AdmissionListItem {
  reason: string;
  attending_doctor: string | null;
  doctor_notes: DoctorNote[];
  nursing_notes: NursingNote[];
}

// ---------------------------------------------------------------------------
// Workflow (ServiceRequest)
// ---------------------------------------------------------------------------

export type RequestStatus =
  | 'REQUESTED' | 'PENDING' | 'APPROVAL_REQUIRED' | 'APPROVED' | 'READY'
  | 'IN_PROGRESS' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED' | 'BLOCKED' | 'REJECTED';

export type RequestTypeCode =
  | 'CT_SCAN' | 'MRI' | 'XRAY' | 'BLOOD_TEST' | 'PATHOLOGY' | 'MEDICATION'
  | 'SURGERY' | 'INSURANCE_APPROVAL' | 'PAYMENT' | 'CONSULTATION'
  | 'DOCUMENT_VERIFICATION' | 'GENERIC_TASK';

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';

export interface StatusTransition {
  id: string;
  from_status: string;
  to_status: string;
  changed_by: string | null;
  changed_by_username: string | null;
  note: string;
  created_at: string;
}

export interface ServiceRequest {
  id: string;
  patient: string;
  patient_name: string;
  admission: string;
  request_type: RequestTypeCode;
  created_by: string;
  target_department: string | null;
  department_name: string | null;
  assigned_to: string | null;
  priority: Priority;
  reason: string;
  status: RequestStatus;
  requires_consent: boolean;
  requires_payment: boolean;
  is_family_visible: boolean;
  linked_consent: string | null;
  result_document: string | null;
  postpone_or_reject_reason: string;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  transitions: StatusTransition[];
}

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------

export type ConsentStatus = 'PENDING' | 'APPROVED' | 'DECLINED';
export type ConsentActionType = 'APPROVE' | 'DECLINE' | 'ASK_DOCTOR';

export interface ConsentAction {
  id: string;
  actor: string;
  actor_username: string;
  actor_role_at_time: string;
  action: ConsentActionType;
  created_at: string;
}

export interface ConsentRequest {
  id: string;
  patient: string;
  patient_name: string;
  admission: string;
  procedure_description: string;
  risk_information: string;
  requested_by: string;
  supporting_document: string | null;
  status: ConsentStatus;
  created_at: string;
  resolved_at: string | null;
  actions: ConsentAction[];
}

// ---------------------------------------------------------------------------
// Referrals & Transfer
// ---------------------------------------------------------------------------

export type ReferralStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CONDITIONAL';

export interface Referral {
  id: string;
  patient: string;
  patient_name: string;
  from_hospital: string;
  from_hospital_name: string;
  from_admission: string;
  to_hospital: string;
  to_hospital_name: string;
  required_department_type: string;
  priority: string;
  reason: string;
  current_condition_summary: string;
  ai_summary: string | null;
  status: ReferralStatus;
  created_by: string;
  responded_by: string | null;
  response_note: string;
  created_at: string;
  responded_at: string | null;
}

export interface ChecklistItemState {
  done: boolean;
  set_by_user_id: string;
  set_by_hospital_id: string;
  at: string;
}

export interface Transfer {
  id: string;
  referral: string;
  ambulance_arranged: boolean;
  checklist: Record<string, ChecklistItemState>;
  new_admission: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface TransferPacket {
  referral: {
    id: string;
    status: ReferralStatus;
    from_hospital: string;
    to_hospital: string;
    created_at: string;
    responded_at: string | null;
    priority: string;
    required_department_type: string;
    reason: string;
    current_condition_summary: string;
  };
  transfer: {
    id: string | null;
    status: string;
    ambulance_arranged: boolean | null;
    completed_at: string | null;
    checklist: Record<string, ChecklistItemState>;
  };
  patient: {
    id: string;
    lifelink_patient_id: string;
    full_name: string;
    date_of_birth: string | null;
    gender: string | null;
    blood_group: string | null;
    access_limited: boolean;
  };
  source_admission: AdmissionListItem & { reason: string; attending_doctor: string | null; doctor_notes?: DoctorNote[]; nursing_notes?: NursingNote[] } | null;
  target_admission: TransferPacket['source_admission'];
  clinical_context: {
    ai_summary: { content_text: string; status: string; generated_at: string; generated_by_service: string } | null;
    ai_references: { source_type: string; source_object_id: string; source_description: string }[];
  };
  allergies: Allergy[];
  medications: Medication[];
  documents: { id: string; doc_type: string; verification_status: string; uploaded_at: string; admission: string | null; access: string }[];
  requests: { id: string; request_type: string; status: string; priority: string; department: string | null; created_at: string; completed_at: string | null }[];
}

// Ownership must mirror apps/referrals/checklist.py::CHECKLIST_ITEMS exactly.
export const CHECKLIST_ITEM_OWNERS: Record<string, 'FROM' | 'TO' | 'EITHER'> = {
  patient_identity_confirmed: 'EITHER',
  referral_note_attached: 'FROM',
  reports_attached: 'FROM',
  medicines_confirmed: 'FROM',
  allergies_confirmed: 'FROM',
  discharge_documentation_attached: 'FROM',
  consent_attached: 'FROM',
  insurance_confirmed: 'EITHER',
  ambulance_arranged: 'FROM',
  bed_ready: 'TO',
  receiving_doctor_confirmed: 'TO',
};

// ---------------------------------------------------------------------------
// Hospitals / Staff
// ---------------------------------------------------------------------------

export interface Hospital {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  is_active: boolean;
}

export type DepartmentType =
  | 'GENERAL' | 'RADIOLOGY' | 'LABORATORY' | 'PHARMACY' | 'OT' | 'WARD'
  | 'BILLING' | 'INSURANCE' | 'MANAGEMENT' | 'ADMIN';

export interface Department {
  id: string;
  hospital: string;
  hospital_name: string;
  name: string;
  department_type: DepartmentType;
  is_active: boolean;
}

export type StaffRole = 'DOCTOR' | 'NURSE' | 'TECHNICIAN' | 'PHARMACIST' | 'COORDINATOR' | 'BILLING_CLERK' | 'INSURANCE_OFFICER' | 'ADMIN';

export interface StaffProfile {
  id: string;
  user: string;
  username: string;
  hospital: string;
  hospital_name: string;
  department: string | null;
  department_name: string | null;
  staff_role: StaffRole;
  employee_id: string;
  job_title: string;
  is_active: boolean;
}

export type ResourceType = 'ICU_BED' | 'GENERAL_BED' | 'OT_SLOT' | 'CARDIOLOGIST' | 'VENTILATOR';

export interface HospitalCapacity {
  id: string;
  hospital: string;
  hospital_name: string;
  resource_type: ResourceType;
  total: number;
  available: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export type InsightType = 'EMERGENCY_SUMMARY' | 'TIMELINE' | 'REFERRAL_SUMMARY' | 'HANDOVER' | 'MISSING_INFO' | 'CONFLICT_ALERT';
export type InsightStatus = 'GENERATED' | 'FLAGGED_CONFLICT' | 'FLAGGED_INCOMPLETE';

export interface AIReference {
  id: string;
  source_type: string;
  source_object_id: string;
  source_description: string;
}

export interface AIInsight {
  id: string;
  patient: string;
  insight_type: InsightType;
  content_text: string;
  status: InsightStatus;
  generated_by_service: string;
  generated_at: string;
  requested_by: string | null;
  references: AIReference[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationPreference {
  in_app: boolean;
  sms: boolean;
  email: boolean;
}

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  patient: string | null;
  admission: string | null;
  is_read: boolean;
  created_at: string;
}

export interface FamilyCommunicationLog {
  id: string;
  patient: string;
  admission: string | null;
  message: string;
  sent_by: string;
  sent_by_username: string;
  sent_to: string;
  related_service_request: string | null;
  sent_at: string;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  actor: string | null;
  actor_username: string | null;
  actor_role: string;
  action: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
  hospital_id: string | null;
  patient_id: string | null;
  admission_id: string | null;
  target_description: string;
  context: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface Document {
  id: string;
  patient: string;
  admission: string | null;
  file: string;
  doc_type: string;
  version: number;
  supersedes: string | null;
  source: string;
  verification_status: string;
  verified_by: string | null;
  verified_by_username: string | null;
  verified_at: string | null;
  rejection_reason: string;
  uploaded_by: string;
  uploaded_by_username: string;
  uploaded_at: string;
  content_type: string;
  size_bytes: number;
}

export interface ApiErrorShape {
  error?: boolean;
  code?: number;
  message?: string;
  detail?: unknown;
}


// ---------------------------------------------------------------------------
// Patient access (Management -> patient). Matches backend apps/patients access grants.
// ---------------------------------------------------------------------------

export type AccessGrantType = 'NORMAL' | 'EMERGENCY';
export type AccessGrantStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

export interface PatientAccessGrant {
  id: string;
  patient_id: string;
  lifelink_patient_id: string;
  grant_type: AccessGrantType;
  /** Already resolved by the server: an approved grant past its end time reads EXPIRED. */
  status: AccessGrantStatus;
  reason: string;
  hospital_name: string;
  requested_by_name: string;
  created_at: string;
  resolved_at: string | null;
  expires_at: string | null;
}

/** Search hit the caller may open in full (own hospital, or a live grant). */
export interface PatientSearchInScope extends PatientListItem {
  access: 'GRANTED';
}

/**
 * Search hit outside the caller's scope. The server sends ONLY these fields:
 * the name is already masked and there is no phone or date of birth.
 */
export interface PatientSearchMasked {
  id: string;
  lifelink_patient_id: string;
  full_name: string; // masked by the server, e.g. "R*** S*****"
  is_unclaimed: boolean;
  access: 'NONE' | AccessGrantStatus;
  access_request_id: string | null;
  can_request_access: boolean;
}

export type PatientSearchRow = PatientSearchInScope | PatientSearchMasked;
