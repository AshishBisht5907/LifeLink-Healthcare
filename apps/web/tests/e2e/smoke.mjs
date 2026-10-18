import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const familyUser = {
  id: 'e2e-family-1', username: 'family_e2e', phone: '+15550002222',
  email: '', role: 'FAMILY', mfa_enabled: false, staff_profile: null,
};
const patientUser = {
  id: 'e2e-patient-1', username: 'patient_e2e', phone: '+15550003333',
  email: '', role: 'PATIENT', mfa_enabled: false, staff_profile: null,
};
const adminUser = {
  id: 'e2e-admin-1', username: 'admin_e2e', phone: '', email: '',
  role: 'HOSPITAL_ADMIN', mfa_enabled: false, staff_profile: { hospital: 'e2e-hospital' },
};
const managementUser = {
  id: 'e2e-management-1', username: 'management_e2e', phone: '', email: '',
  role: 'HOSPITAL_MANAGEMENT', mfa_enabled: false, staff_profile: { hospital: 'e2e-hospital', hospital_id: 'e2e-hospital' },
};

const patientId = 'e2e-patient-profile-1';
const patientLifelinkId = 'LL-P-E2E-1001';
const grantId = 'e2e-access-grant-1';
let grantStatus = 'NONE';
let grantResolvedAt = null;
let grantExpiresAt = null;

function grantRow() {
  return {
    id: grantId, patient_id: patientId, lifelink_patient_id: patientLifelinkId,
    grant_type: 'NORMAL', status: grantStatus, reason: 'Management E2E care review',
    hospital_name: 'E2E General Hospital', requested_by_name: managementUser.username,
    created_at: '2026-10-18T08:00:00Z', resolved_at: grantResolvedAt, expires_at: grantExpiresAt,
  };
}
const patientDetail = {
  id: patientId, lifelink_patient_id: patientLifelinkId, full_name: 'E2E Patient',
  date_of_birth: '1990-01-01', gender: 'F', phone: patientUser.phone, address: 'E2E address',
  blood_group: 'O+', blood_group_verification: 'VERIFIED', is_unclaimed: false,
  allergies: [{ id: 'allergy-e2e', patient: patientId, substance: 'Penicillin', severity: 'MILD', source: 'DOCTOR_ENTERED', verification_status: 'VERIFIED', recorded_at: '2026-10-01T00:00:00Z' }],
  history_entries: [{ id: 'history-e2e', patient: patientId, event_type: 'DIAGNOSIS', description: 'Verified E2E history', event_date: '2024-02-01', source: 'DOCTOR_ENTERED', verification_status: 'VERIFIED', originating_hospital: 'hospital-b', originating_admission: null, created_at: '2026-10-01T00:00:00Z' }],
  medications: [{ id: 'med-e2e', patient: patientId, admission: null, name: 'Salbutamol', dosage: '2 puffs', frequency: 'As needed', start_date: '2024-02-01', stop_date: null, prescribing_doctor: null, status: 'ACTIVE', source: 'DOCTOR_ENTERED', created_at: '2026-10-01T00:00:00Z' }],
  emergency_contacts: [], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
};
const careSummary = {
  admissions: [{ id: 'admission-e2e', admission_number: 'E2E-ADM-1', patient: patientId, patient_name: 'E2E Patient', hospital: 'hospital-b', hospital_name: 'Remote E2E Hospital', status: 'ACTIVE', admitted_at: '2026-10-17T09:00:00Z', discharged_at: null }],
  requests: [{ id: 'request-e2e', patient: patientId, patient_name: 'E2E Patient', admission: 'admission-e2e', request_type: 'CT_SCAN', created_by: '', target_department: null, department_name: 'Radiology', assigned_to: null, assigned: true, priority: 'HIGH', reason: '', status: 'IN_PROGRESS', requires_consent: false, requires_payment: false, is_family_visible: true, linked_consent: null, result_document: null, postpone_or_reject_reason: '', created_at: '2026-10-17T09:30:00Z', updated_at: '2026-10-17T10:00:00Z', due_at: '2026-10-20T10:00:00Z', completed_at: null, completed_by: null, transitions: [{ id: 'transition-e2e', from_status: 'APPROVED', to_status: 'IN_PROGRESS', changed_by: null, changed_by_username: null, note: '', created_at: '2026-10-17T10:00:00Z' }] }],
  referrals: [], transfers: {},
};

const backend = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = url.pathname;
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const authenticatedUser = token === 'e2e-staff-access-token' ? adminUser
    : token === 'e2e-management-access-token' ? managementUser
    : token === 'e2e-patient-access-token' ? patientUser
    : token === 'e2e-access-token' ? familyUser : null;
  const paginatedEmpty = { count: 0, next: null, previous: null, results: [] };

  if (req.method === 'POST' && path === '/api/auth/otp/request/') {
    const payload = JSON.parse(body || '{}');
    return json(200, { detail: 'OTP sent.', dev_otp: '123456', phone: payload.phone });
  }
  if (req.method === 'POST' && path === '/api/auth/otp/verify/') {
    const payload = JSON.parse(body || '{}');
    const user = payload.phone === patientUser.phone ? patientUser : familyUser;
    const access = user === patientUser ? 'e2e-patient-access-token' : 'e2e-access-token';
    return json(200, { user, access, refresh: user === patientUser ? 'e2e-patient-refresh-token' : 'e2e-refresh-token' });
  }
  if (req.method === 'POST' && path === '/api/auth/staff/login/') {
    const credentials = JSON.parse(body || '{}');
    if (credentials.username === 'admin_e2e' && credentials.password === 'DemoPass123!') {
      return json(200, { user: adminUser, access: 'e2e-staff-access-token', refresh: 'e2e-staff-refresh-token' });
    }
    if (credentials.username === 'management_e2e' && credentials.password === 'DemoPass123!') {
      return json(200, { user: managementUser, access: 'e2e-management-access-token', refresh: 'e2e-management-refresh-token' });
    }
    return json(401, { detail: 'Invalid credentials.' });
  }
  if (req.method === 'GET' && path === '/api/auth/me/') {
    return authenticatedUser ? json(200, authenticatedUser) : json(401, { detail: 'Authentication required.' });
  }

  // Stateful fake API for the management -> patient consent -> profile browser scenario.
  if (path === '/api/patients/access-requests/' && req.method === 'GET') {
    if (authenticatedUser?.role === 'HOSPITAL_MANAGEMENT') return json(200, grantStatus === 'NONE' ? [] : [grantRow()]);
    if (authenticatedUser?.role === 'PATIENT') return json(200, grantStatus === 'NONE' ? [] : [grantRow()]);
    return json(403, { detail: 'You cannot view access requests.' });
  }
  if (path === '/api/patients/access-requests/' && req.method === 'POST') {
    if (authenticatedUser?.role !== 'HOSPITAL_MANAGEMENT') return json(403, { detail: 'Only Management can request access.' });
    grantStatus = 'PENDING';
    return json(201, grantRow());
  }
  if (path === `/api/patients/access-requests/${grantId}/approve/` && req.method === 'POST') {
    if (authenticatedUser?.role !== 'PATIENT') return json(404, { detail: 'Access request not found.' });
    grantStatus = 'APPROVED';
    grantResolvedAt = new Date().toISOString();
    grantExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return json(200, grantRow());
  }
  if (path === `/api/patients/search/` && req.method === 'GET') {
    if (authenticatedUser?.role !== 'HOSPITAL_MANAGEMENT') return json(403, { detail: 'Patient search is restricted.' });
    if (url.searchParams.get('lifelink_patient_id') !== patientLifelinkId) return json(200, []);
    if (grantStatus === 'APPROVED') return json(200, [{ id: patientId, ...patientDetail, access: 'GRANTED' }]);
    return json(200, [{ id: patientId, lifelink_patient_id: patientLifelinkId, full_name: 'E*** P*****', is_unclaimed: false, access: grantStatus, access_request_id: grantId, can_request_access: true }]);
  }
  if (path === `/api/patients/${patientId}/` && req.method === 'GET') {
    if (authenticatedUser?.role === 'PATIENT' || (authenticatedUser?.role === 'HOSPITAL_MANAGEMENT' && grantStatus === 'APPROVED')) return json(200, patientDetail);
    return json(403, { detail: 'You are not authorised to view this patient.' });
  }
  if (path === `/api/patients/${patientId}/care-summary/` && req.method === 'GET') {
    if (authenticatedUser?.role === 'HOSPITAL_MANAGEMENT' && grantStatus === 'APPROVED') return json(200, careSummary);
    return json(403, { detail: 'You are not authorised to view this patient care summary.' });
  }
  if (path.startsWith('/api/')) {
    return json(200, paginatedEmpty);
  }
  return json(404, { detail: 'Not found.' });
});

await new Promise((resolve, reject) => {
  backend.once('error', reject);
  backend.listen(8000, '127.0.0.1', resolve);
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const home = await page.goto(baseURL);
  assert.equal(home?.status(), 200, 'home page should load');
  await page.getByRole('heading', { name: /better connection/i }).waitFor();
  await page.getByRole('link', { name: /patient & family/i }).click();
  await page.getByRole('heading', { name: 'Patient & Family Access' }).waitFor();
  await page.getByRole('link', { name: /create a family account/i }).click();
  await page.getByRole('heading', { name: 'Join LifeLink as family' }).waitFor();

  await page.getByLabel('Your full name').fill('Family E2E');
  await page.getByLabel('Your mobile number').fill('+15550002222');
  await page.getByLabel('Patient LifeLink ID').fill('LL-P-100001');
  await page.getByLabel('Your relationship to the patient').fill('Sibling');
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await page.getByText('Development OTP:').waitFor();
  await page.getByLabel('Verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.waitForURL('**/portal', { timeout: 10000 });
  await page.getByText('Family account created').waitFor();
  console.log('PASS: family OTP login creates a server-side session and opens the portal');

  // Staff login must also set the same httpOnly session cookies before the
  // client refreshes /auth/me and enters a role-protected dashboard.
  await page.goto(`${baseURL}/login/staff?role=admin`);
  await page.getByPlaceholder('e.g. doctor_abc').fill('admin_e2e');
  await page.locator('input[autocomplete="current-password"]').fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin', { timeout: 10000 });
  console.log('PASS: staff login creates a server-side session and opens the admin dashboard');

  // Management asks for access, the patient approves from their own session,
  // and Management then opens/refreshes the real Next.js patient detail route.
  const managementContext = await browser.newContext();
  const managementPage = await managementContext.newPage();
  await managementPage.goto(`${baseURL}/login/staff?role=management`);
  await managementPage.getByPlaceholder('e.g. doctor_abc').fill('management_e2e');
  await managementPage.locator('input[autocomplete="current-password"]').fill('DemoPass123!');
  await managementPage.getByRole('button', { name: 'Sign in' }).click();
  await managementPage.waitForURL('**/management', { timeout: 10000 });
  await managementPage.goto(`${baseURL}/management/patients`);
  await managementPage.getByLabel('LifeLink Patient ID').fill(patientLifelinkId);
  await managementPage.getByRole('button', { name: 'Search' }).click();
  await managementPage.getByRole('button', { name: 'Request access' }).click();
  await managementPage.getByLabel('Reason for access').fill('Review the patient care plan');
  await managementPage.getByRole('button', { name: 'Send request' }).click();
  await managementPage.getByText('Status: Pending').waitFor();
  await managementPage.getByRole('button', { name: 'Done' }).click();

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  await patientPage.goto(`${baseURL}/login/patient`);
  await patientPage.getByLabel('Mobile number').fill(patientUser.phone);
  await patientPage.getByRole('button', { name: 'Send code' }).click();
  await patientPage.getByText(/Demo mode — your code is/).waitFor();
  await patientPage.getByLabel('6-digit code').fill('123456');
  await patientPage.getByRole('button', { name: 'Verify & continue' }).click();
  await patientPage.waitForURL('**/portal', { timeout: 10000 });
  await patientPage.goto(`${baseURL}/portal/access-requests`);
  await patientPage.getByRole('button', { name: 'Approve', exact: true }).click();
  await patientPage.getByRole('button', { name: 'Approve access' }).click();
  await patientPage.getByText('Access approved', { exact: true }).first().waitFor();

  await managementPage.getByRole('button', { name: 'Search' }).click();
  await managementPage.getByRole('link', { name: 'Open record' }).waitFor({ timeout: 15000 });
  await managementPage.getByRole('link', { name: 'Open record' }).click();
  await managementPage.getByRole('heading', { name: 'E2E Patient' }).waitFor();
  await managementPage.getByText('Penicillin').waitFor();
  await managementPage.getByText('Verified E2E history').waitFor();
  await managementPage.getByText('CT Scan').waitFor();
  await managementPage.getByText(/Due/).waitFor();
  await managementPage.reload();
  await managementPage.getByRole('heading', { name: 'E2E Patient' }).waitFor();
  await managementPage.getByText('Verified E2E history').waitFor();
  await managementPage.getByText('CT Scan').waitFor();
  console.log('PASS: Management requests access, patient approves, and authorized patient details/care summary load and survive refresh');

  await patientContext.close();
  await managementContext.close();
} finally {
  await browser.close();
  await new Promise(resolve => backend.close(resolve));
}
