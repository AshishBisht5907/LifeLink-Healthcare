import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const user = {
  id: 'e2e-family-1',
  username: 'family_e2e',
  phone: '+15550002222',
  email: '',
  role: 'FAMILY',
  mfa_enabled: false,
  staff_profile: null,
};

try {
  // The browser suite exercises the real Next.js pages and client interactions.
  // Auth APIs are stubbed so this CI smoke test does not send SMS or require a
  // seeded personal record. Backend workflow/API integration is tested separately
  // by pytest against Django and its test database.
  await page.route('**/api/auth/otp-request', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'OTP sent.', dev_otp: '123456' }),
  }));
  await page.route('**/api/auth/otp-verify', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user, access: 'e2e-access-token', refresh: 'e2e-refresh-token' }),
  }));
  await page.route('**/api/proxy/auth/me/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(user),
  }));
  await page.route('**/api/proxy/**', route => {
    const isMe = new URL(route.request().url()).pathname.includes('/auth/me/');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isMe ? user : { count: 0, results: [] }),
    });
  });

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
  console.log('PASS: home -> patient login -> family registration -> OTP verify -> portal redirect');
} finally {
  await browser.close();
}
