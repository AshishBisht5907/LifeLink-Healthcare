import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const password = process.env.E2E_STAFF_PASSWORD;
if (!password) throw new Error('E2E_STAFF_PASSWORD must be set by the CI test job');

const patientId = process.env.E2E_PATIENT_PROFILE_ID;
const patientPhone = process.env.E2E_PATIENT_PHONE;
const patientLifeLinkId = process.env.E2E_PATIENT_LIFELINK_ID;
if (!patientId || !patientPhone || !patientLifeLinkId) {
  throw new Error('E2E patient fixture identifiers must be supplied by CI');
}

const browser = await chromium.launch({ headless: true });
const managementContext = await browser.newContext();
const managementPage = await managementContext.newPage();
const patientContext = await browser.newContext();
const patientPage = await patientContext.newPage();
const doctorContext = await browser.newContext();
const doctorPage = await doctorContext.newPage();

async function staffLogin(page, username, role) {
  await page.goto(`${baseURL}/login/staff?role=${role}`);
  await page.getByPlaceholder('e.g. doctor_abc').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

try {
  // Management searches and requests access. The profile route must remain
  // locked while the grant is still pending.
  await staffLogin(managementPage, 'management_e2e', 'management');
  await managementPage.waitForURL('**/management', { timeout: 15000 });
  await managementPage.goto(`${baseURL}/management/patients`);
  await managementPage.getByLabel('LifeLink Patient ID').fill(patientLifeLinkId);
  await managementPage.getByRole('button', { name: 'Search' }).click();
  await managementPage.getByRole('button', { name: 'Request access' }).click();
  await managementPage.getByLabel('Reason for access').fill('Review patient care plan');
  await managementPage.getByRole('button', { name: 'Send request' }).click();
  await managementPage.getByText('Status: Pending').waitFor();
  await managementPage.getByRole('button', { name: 'Done' }).click();

  await managementPage.goto(`${baseURL}/management/patients/${patientId}`);
  await managementPage.getByRole('heading', { name: 'Access to this record is required' }).waitFor();
  assert.equal(await managementPage.getByText('Verified E2E asthma history').count(), 0,
    'patient clinical history must stay hidden before approval');

  // Patient signs in via the actual Django mock OTP provider and approves
  // the grant from the patient-facing Access requests screen.
  await patientPage.goto(`${baseURL}/login/patient`);
  await patientPage.getByLabel('Mobile number').fill(patientPhone);
  await patientPage.getByRole('button', { name: 'Send code' }).click();
  const demoCodeNotice = patientPage.getByText(/Demo mode — your code is/);
  await demoCodeNotice.waitFor();
  const demoCode = await patientPage.locator('strong').filter({ hasText: /^\d{6}$/ }).innerText();
  assert.match(demoCode, /^\d{6}$/, 'mock OTP should be displayed by the real Django dev provider');
  await patientPage.getByLabel('6-digit code').fill(demoCode);
  await patientPage.getByRole('button', { name: 'Verify & continue' }).click();
  await patientPage.waitForURL('**/portal', { timeout: 15000 });
  await patientPage.goto(`${baseURL}/portal/access-requests`);
  await patientPage.getByRole('button', { name: 'Approve', exact: true }).click();
  await patientPage.getByRole('button', { name: 'Approve access' }).click();
  await patientPage.getByText('Access approved', { exact: true }).first().waitFor();

  // Re-search after approval, open the same patient's profile, and confirm
  // the backend-provided profile and cross-hospital care status render.
  await managementPage.goto(`${baseURL}/management/patients`);
  await managementPage.getByLabel('LifeLink Patient ID').fill(patientLifeLinkId);
  await managementPage.getByRole('button', { name: 'Search' }).click();
  await managementPage.getByRole('link', { name: /Open record/ }).waitFor();
  await managementPage.getByRole('link', { name: /Open record/ }).click();
  await managementPage.getByRole('heading', { name: 'LifeLink E2E Patient' }).waitFor();
  await managementPage.getByText('Penicillin').waitFor();
  await managementPage.getByText('Verified E2E asthma history').waitFor();
  await managementPage.getByText('Salbutamol').waitFor();
  await managementPage.getByText('CT Scan').waitFor();
  await managementPage.getByText(/Due/).waitFor();
  await managementPage.getByText(/Referral to LifeLink E2E General Hospital/).waitFor();

  // Refresh must retain access and re-load the same real patient facts.
  await managementPage.reload();
  await managementPage.getByRole('heading', { name: 'LifeLink E2E Patient' }).waitFor();
  await managementPage.getByText('Verified E2E asthma history').waitFor();
  await managementPage.getByText('CT Scan').waitFor();

  // A different hospital staff account without the user-bound grant remains
  // denied, even though it can authenticate and navigate to a patient route.
  await staffLogin(doctorPage, 'doctor_e2e', 'staff');
  await doctorPage.waitForURL('**/staff', { timeout: 15000 });
  await doctorPage.goto(`${baseURL}/staff/patients/${patientId}`);
  await doctorPage.getByRole('heading', { name: 'Access denied' }).waitFor();
  assert.equal(await doctorPage.getByText('Verified E2E asthma history').count(), 0,
    'unauthorized staff must not see patient clinical history');

  console.log('PASS: real Django management request -> patient approval -> protected profile/care summary -> refresh -> unauthorized staff denied');
} finally {
  await doctorContext.close();
  await patientContext.close();
  await managementContext.close();
  await browser.close();
}
