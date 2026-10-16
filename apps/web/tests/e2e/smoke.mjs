import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const user = {
  id: 'e2e-family-1',
  username: 'family_e2e',
  phone: '+15550002222',
  email: '',
  role: 'FAMILY',
  mfa_enabled: false,
  staff_profile: null,
};
const staffUser = {
  id: 'e2e-admin-1',
  username: 'admin_e2e',
  phone: '',
  email: '',
  role: 'HOSPITAL_ADMIN',
  mfa_enabled: false,
  staff_profile: { hospital: 'e2e-hospital' },
};

// Run a tiny local backend double. The browser still goes through the real
// Next.js auth route handlers and proxy, including httpOnly cookie creation.
// No real credentials or SMS provider are involved in this test.
const backend = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  if (req.method === 'POST' && path === '/api/auth/otp/request/') {
    return json(200, { detail: 'OTP sent.', dev_otp: '123456' });
  }
  if (req.method === 'POST' && path === '/api/auth/otp/verify/') {
    return json(200, { user, access: 'e2e-access-token', refresh: 'e2e-refresh-token' });
  }
  if (req.method === 'POST' && path === '/api/auth/staff/login/') {
    const credentials = JSON.parse(body || '{}');
    if (credentials.username !== 'admin_e2e' || credentials.password !== 'DemoPass123!') {
      return json(401, { detail: 'Invalid credentials.' });
    }
    return json(200, { user: staffUser, access: 'e2e-staff-access-token', refresh: 'e2e-staff-refresh-token' });
  }
  if (req.method === 'GET' && path === '/api/auth/me/') {
    const authorization = req.headers.authorization || '';
    if (authorization === 'Bearer e2e-staff-access-token') return json(200, staffUser);
    if (authorization === 'Bearer e2e-access-token') return json(200, user);
    return json(401, { detail: 'Authentication required.' });
  }
  if (path.startsWith('/api/')) {
    return json(200, { count: 0, next: null, previous: null, results: [] });
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
  await page.getByRole('heading', { name: 'LifeLink' }).waitFor();
  await page.getByRole('link', { name: /patient \/ family/i }).click();
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
} finally {
  await browser.close();
  await new Promise(resolve => backend.close(resolve));
}
