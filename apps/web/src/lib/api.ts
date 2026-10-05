import type {
  AdmissionDetail, AdmissionListItem, AIInsight, Allergy, AuditLogEntry, ConsentRequest,
  Department, Document as LLDocument, EmergencyContact, FamilyCommunicationLog, FamilyRelationship,
  Hospital, HospitalCapacity, LiveStatusItem, Me, MedicalHistoryEntry, Medication, Notification,
  NotificationPreference, Paginated, PatientDetail, PatientListItem, Referral, ServiceRequest, StatusTransition,
  StaffProfile, Transfer, TransferPacket, PatientAccessGrant, PatientSearchRow,
} from './types';

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: { method: string; headers?: Record<string, string>; body?: any } = { method: 'GET' }): Promise<T> {
  // Next.js redirects any route ending in "/" to the no-slash form by
  // default, which would intercept our own /api/proxy/* URL before it ever
  // reaches the catch-all handler. Strip a trailing slash from the path
  // portion (but not the query string) here — route.ts always re-adds the
  // slash Django expects when it forwards the request downstream.
  const [rawPath, query] = path.split('?');
  const cleanPath = rawPath.replace(/\/$/, '');
  const queryString = query ? `?${query}` : '';
  const finalPath = `${cleanPath}${queryString}`;

  // Check if body is FormData to avoid setting Content-Type for multipart
  const isFormData = options.body instanceof FormData;
  let body = options.body;
  // If body is present and not FormData nor string, assume it's a JSON object and stringify it
  if (!isFormData && body !== undefined && body !== null && typeof body !== 'string') {
    body = JSON.stringify(body);
  }

  const resp = await fetch(`/api/proxy/${finalPath}`, {
    method: options.method,
    headers: isFormData
      ? options.headers
      : { 'Content-Type': 'application/json', ...options.headers },
    body,
  });

  if (resp.status === 204) return undefined as T;

  const contentType = resp.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await resp.json().catch(() => ({})) : null;

  if (!resp.ok) {
    const message =
      (data && (data.message || data.detail)) ||
      (resp.status === 401 ? 'Your session has expired. Please log in again.' :
       resp.status === 403 ? 'You are not authorised to do this.' :
       resp.status === 404 ? 'Not found.' :
       'Something went wrong.');
    throw new ApiError(resp.status, typeof message === 'string' ? message : JSON.stringify(message), data);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path, { method: 'GET' });
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });

// Auth endpoints (login/otp/logout) hit their own dedicated Next.js routes
// directly — NOT the generic /api/proxy/* passthrough — because they mint
// or clear the httpOnly session cookies rather than just forwarding data.
async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new ApiError(resp.status, (data && (data.message || data.detail)) || 'Login failed.', data);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Auth (login/otp/logout go through their own dedicated routes, not the
// generic proxy, since they mint/clear cookies — see src/app/api/auth/*)
// ---------------------------------------------------------------------------

export const authApi = {
  me: () => get<Me>('auth/me/'),
  staffLogin: (username: string, password: string, mfa_code?: string) =>
    authRequest<{ user: Me }>('staff-login', { username, password, mfa_code }),
  otpRequest: (
    phone: string,
    purpose: 'LOGIN' | 'REGISTER' | 'CLAIM_PROFILE',
    data?: {
      full_name?: string;
      date_of_birth?: string;
      gender?: string;
      email?: string;
      address?: string;
    }
  ) =>
    authRequest<{ detail: string; dev_otp?: string }>('otp-request', {
      phone,
      purpose,
      ...data,
    }),
  otpVerify: (
    phone: string,
    purpose: 'LOGIN' | 'REGISTER' | 'CLAIM_PROFILE',
    code: string,
    full_name?: string,
    date_of_birth?: string,
    gender?: string,
    email?: string,
    address?: string
  ) =>
    authRequest<{ user: Me }>('otp-verify', {
      phone,
      purpose,
      code,
      full_name,
      date_of_birth,
      gender,
      email,
      address,
    }),
  logout: () => authRequest<{ detail: string }>('logout'),
  verifyAadhaar: (aadhaar_number: string, demo_otp: string) =>
    post<{ detail: string; is_mock: boolean; masked_identifier?: string; full_name?: string }>(
      'auth/identity/aadhaar/verify/', { aadhaar_number, demo_otp }),
};

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export const patientsApi = {
  me: () => get<PatientDetail[]>('patients/me/'),
  // A family user gets their own links (all linked patients); a patient gets none.
  familyLinks: () => get<Paginated<FamilyRelationship>>('patients/family-links/'),
  // Links for one patient. The backend allows this only for someone who may access that patient.
  familyLinksForPatient: (patientId: string) => get<Paginated<FamilyRelationship>>(`patients/family-links/?patient=${patientId}`),
  // The ONLY family-link change the UI makes: switch a link off/on. (Creating/editing links is deliberately not exposed.)
  setFamilyLinkActive: (id: string, active: boolean) => request<FamilyRelationship>(`patients/family-links/${id}/`, { method: 'PATCH', body: { is_active: active } }),
  search: (params: { lifelink_patient_id?: string; phone?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return get<PatientSearchRow[]>(`patients/search/?${qs}`);
  },
  get: (id: string) => get<PatientDetail>(`patients/${id}/`),
  liveStatus: (id: string) => get<LiveStatusItem[]>(`patients/${id}/live_status/`),
  createUnclaimed: (data: { full_name: string; date_of_birth?: string; gender?: string; phone?: string }) =>
    post<PatientDetail>('patients/create_unclaimed/', data),
  claim: (lifelink_patient_id: string) => post<PatientDetail>('patients/claim/', { lifelink_patient_id }),
  grantAccess: (id: string) => post<{ detail: string; otp_id: string; dev_otp?: string }>(`patients/${id}/send_welcome_sms/`, {}),
  allergies: (patientId: string) => get<Allergy[]>(`patients/allergies/?patient=${patientId}`),
  addAllergy: (data: { patient: string; substance: string; severity: string }) =>
    post<Allergy>('patients/allergies/', data),
  verifyAllergy: (id: string) => post<Allergy>(`patients/allergies/${id}/verify/`, {}),
  rejectAllergy: (id: string, reason: string) => post<Allergy>(`patients/allergies/${id}/reject/`, { reason }),
  history: (patientId: string) => get<MedicalHistoryEntry[]>(`patients/history/?patient=${patientId}`),
  medications: (patientId: string) => get<Medication[]>(`patients/medications/?patient=${patientId}`),
  emergencyContacts: (patientId: string) => get<EmergencyContact[]>(`patients/emergency-contacts/?patient=${patientId}`),
};

// ---------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------

export const admissionsApi = {
  list: () => get<Paginated<AdmissionListItem>>('admissions/'),
  get: (id: string) => get<AdmissionDetail>(`admissions/${id}/`),
  create: (data: { patient: string; reason?: string; attending_doctor?: string }) =>
    post<AdmissionDetail>('admissions/', data),
  discharge: (id: string) => post<AdmissionDetail>(`admissions/${id}/discharge/`),
  doctorNotes: (admissionId: string) => get<Paginated<any>>(`admissions/doctor-notes/?admission=${admissionId}`),
  addDoctorNote: (admission: string, content: string) =>
    post<any>('admissions/doctor-notes/', { admission, content }),
  nursingNotes: (admissionId: string) => get<Paginated<any>>(`admissions/nursing-notes/?admission=${admissionId}`),
  addNursingNote: (admission: string, content: string) =>
    post<any>('admissions/nursing-notes/', { admission, content }),
};

// ---------------------------------------------------------------------------
// Workflow (ServiceRequest)
// ---------------------------------------------------------------------------

export const requestsApi = {
  list: (filters?: { admission?: string; patient?: string; status?: string; request_type?: string }) => {
    const qs = filters ? `?${new URLSearchParams(filters).toString()}` : '';
    return get<Paginated<ServiceRequest>>(`requests/${qs}`);
  },
  get: (id: string) => get<ServiceRequest>(`requests/${id}`),
  create: (data: { patient: string; admission: string; request_type: string; reason?: string; priority?: string }) =>
    post<ServiceRequest>('requests/', data),
  accept: (id: string, note?: string) => post<ServiceRequest>(`requests/${id}/accept/`, { note }),
  start: (id: string, note?: string) => post<ServiceRequest>(`requests/${id}/start/`, { note }),
  complete: (id: string, note?: string) => post<ServiceRequest>(`requests/${id}/complete/`, { note }),
  postpone: (id: string, note?: string) => post<ServiceRequest>(`requests/${id}/postpone/`, { note }),
  cancel: (id: string, note?: string) => post<ServiceRequest>(`requests/${id}/cancel/`, { note }),
  reject: (id: string, note?: string) => post<ServiceRequest>(`requests/${id}/reject/`, { note }),
};

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------

export const consentsApi = {
  list: () => get<Paginated<ConsentRequest>>('consents/'),
  get: (id: string) => get<ConsentRequest>(`consents/${id}/`),
  create: (data: { patient: string; admission: string; procedure_description: string; risk_information?: string; service_request?: string }) =>
    post<ConsentRequest>('consents/', data),
  decide: (id: string, action: 'APPROVE' | 'DECLINE' | 'ASK_DOCTOR') =>
    post<ConsentRequest>(`consents/${id}/decide/`, { action }),
};

// ---------------------------------------------------------------------------
// Referrals & Transfer
// ---------------------------------------------------------------------------

export const referralsApi = {
  list: () => get<Paginated<Referral>>('referrals/'),
  get: (id: string) => get<Referral>(`referrals/${id}/`),
  create: (data: {
    patient: string; from_admission: string; to_hospital: string; required_department_type: string;
    priority?: string; reason: string; current_condition_summary?: string;
  }) => post<Referral>('referrals/', data),
  respond: (id: string, decision: 'ACCEPTED' | 'REJECTED' | 'CONDITIONAL', response_note?: string) =>
    post<Referral>(`referrals/${id}/respond/`, { decision, response_note }),
  getTransfer: (id: string) => get<Transfer>(`referrals/${id}/transfer`),
  getTransferPacket: (id: string) => get<TransferPacket>(`referrals/${id}/transfer_packet`),
  updateChecklist: (id: string, checklist_updates: Record<string, boolean>) =>
    post<Transfer>(`referrals/${id}/checklist/`, { checklist_updates }),
  completeTransfer: (id: string) => post<Transfer>(`referrals/${id}/complete_transfer/`, {}),
};

// ---------------------------------------------------------------------------
// Hospitals / Departments / Staff / Capacity
// ---------------------------------------------------------------------------

export const hospitalsApi = {
  list: () => get<Paginated<Hospital>>('hospitals/'),
  departments: (hospitalId?: string) =>
    get<Paginated<Department>>(`departments/${hospitalId ? `?hospital=${hospitalId}` : ''}`),
  createDepartment: (data: { name: string; department_type: string }) =>
    post<Department>('departments/', data),
  capacity: (hospitalId?: string) =>
    get<Paginated<HospitalCapacity>>(`capacity/${hospitalId ? `?hospital=${hospitalId}` : ''}`),
  setCapacity: (data: { hospital: string; resource_type: string; total: number; available: number }) =>
    post<HospitalCapacity>('capacity/', data),
};

export const staffApi = {
  list: () => get<Paginated<StaffProfile>>('staff/'),
  provision: (data: {
    username: string; initial_password: string; department?: string; staff_role: string;
    employee_id: string; job_title?: string;
  }) => post<StaffProfile>('staff/provision/', data),
  activate: (id: string) => post<StaffProfile>(`staff/${id}/activate/`, {}),
  deactivate: (id: string) => post<StaffProfile>(`staff/${id}/deactivate/`, {}),
};

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export const aiApi = {
  list: (patientId: string) => get<Paginated<AIInsight>>(`ai/?patient=${patientId}`),
  get: (id: string) => get<AIInsight>(`ai/${id}/`),
  generateEmergencySummary: (patient: string) => post<AIInsight>('ai/generate_emergency_summary/', { patient }),
  missingInformation: (patientId: string) => get<{ flags: string[] }>(`ai/missing_information/?patient=${patientId}`),
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationsApi = {
  list: () => get<Paginated<Notification>>('notifications/'),
  markRead: (id: string) => post<Notification>(`notifications/${id}/mark_read/`, {}),
  getPreferences: () => get<NotificationPreference>('notifications/preferences/me/'),
  updatePreferences: (data: Partial<NotificationPreference>) => request<NotificationPreference>('notifications/preferences/me/', { method: 'PATCH', body: data }),
  familyCommunications: (patientId: string) =>
    get<Paginated<FamilyCommunicationLog>>(`notifications/family-communications/?patient=${patientId}`),
  sendFamilyCommunication: (data: { patient: string; sent_to: string; message: string; admission?: string }) =>
    post<FamilyCommunicationLog>('notifications/family-communications/', data),
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documentsApi = {
  list: (patientId: string) => get<Paginated<LLDocument>>(`documents/?patient=${patientId}`),
  upload: (formData: FormData) => request<LLDocument>('documents/', { method: 'POST', body: formData }),
  signedUrl: (id: string) => get<{ download_path: string; expires_in_seconds: number }>(`documents/${id}/signed_url/`),
  verify: (id: string) => post<LLDocument>(`documents/${id}/verify/`, {}),
  reject: (id: string, reason: string) => post<LLDocument>(`documents/${id}/reject/`, { reason }),
};

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditApi = {
  list: (filters?: Record<string, string>) => {
    const qs = filters ? `?${new URLSearchParams(filters).toString()}` : '';
    return get<Paginated<AuditLogEntry>>(`audit/${qs}`);
  },
};


// ---------------------------------------------------------------------------
// Patient access grants (Management). The backend decides everything; the
// frontend only sends the request and shows the real resulting status.
// ---------------------------------------------------------------------------

export const accessApi = {
  /** Management: the caller's own requests. Patient: requests about their record. */
  list: () => get<PatientAccessGrant[]>('patients/access-requests/'),
  request: (patient: string, reason: string) => post<PatientAccessGrant>('patients/access-requests/', { patient, reason }),
  // Patient only. The backend rejects anyone else (family included).
  approve: (id: string) => post<PatientAccessGrant>(`patients/access-requests/${id}/approve/`, {}),
  decline: (id: string) => post<PatientAccessGrant>(`patients/access-requests/${id}/decline/`, {}),
  revoke: (id: string) => post<PatientAccessGrant>(`patients/access-requests/${id}/revoke/`, {}),
  emergency: (patient: string, reason: string) => post<PatientAccessGrant>('patients/access-requests/emergency/', { patient, reason }),
};
