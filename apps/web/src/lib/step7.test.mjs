import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, fileKind, MAX_UPLOAD_BYTES, displayName, docTypeLabel } from './documentRules.ts';
import { explainFamilyAccess, latestConsentStatus } from './familyAccess.ts';
import { consentChoices, sortConsents } from './consentView.ts';
import { filterNotifications, unreadCount, notificationHref, notificationMeta } from './notificationView.ts';

test('upload: PDF, DOCX, PNG, JPG, JPEG accepted (case-insensitive) under 15 MB', () => {
  for (const n of ['a.pdf', 'a.DOCX', 'a.png', 'a.jpg', 'a.JPEG']) assert.equal(validateUpload({ name: n, size: 1000 }), null, n);
  assert.equal(validateUpload({ name: 'a.pdf', size: MAX_UPLOAD_BYTES }), null);
});
test('upload: rejects empty, oversize, wrong type and missing file with a friendly message', () => {
  assert.match(validateUpload(null), /Choose/);
  assert.match(validateUpload({ name: 'a.pdf', size: 0 }), /empty/);
  assert.match(validateUpload({ name: 'a.pdf', size: MAX_UPLOAD_BYTES + 1 }), /15 MB/);
  for (const n of ['a.exe', 'a.doc', 'a.gif', 'a', 'a.pdf.exe']) assert.match(validateUpload({ name: n, size: 10 }), /Only PDF/, n);
});
test('file kinds and labels never show raw codes or storage paths', () => {
  assert.equal(fileKind('x.DOCX'), 'DOCX'); assert.equal(fileKind('x.jpeg'), 'IMAGE'); assert.equal(fileKind('x.zip'), 'FILE');
  assert.equal(displayName('documents/2026/09/Blood%20report.pdf'), 'Blood report.pdf');
  assert.equal(docTypeLabel('LAB_REPORT'), 'Lab report'); assert.equal(docTypeLabel('NEW_KIND'), 'New kind');
});

const L = (o = {}) => ({ is_active: true, access_level: 'FULL_REPRESENTATIVE', ...o });
test('family access: the explanation matches the backend rule, one condition at a time', () => {
  assert.equal(explainFamilyAccess(L({ is_active: false }), 'APPROVED').kind, 'PAUSED');
  assert.equal(explainFamilyAccess(L({ access_level: 'UPDATES_ONLY' }), 'APPROVED').kind, 'UPDATES_ONLY');
  assert.equal(explainFamilyAccess(L({ access_level: 'LIMITED' }), 'APPROVED').canViewRecord, false);
  assert.equal(explainFamilyAccess(L(), null).kind, 'NO_CONSENT');
  assert.equal(explainFamilyAccess(L(), 'PENDING').kind, 'CONSENT_PENDING');
  assert.equal(explainFamilyAccess(L(), 'DECLINED').kind, 'CONSENT_DECLINED');
  const ok = explainFamilyAccess(L(), 'APPROVED');
  assert.deepEqual([ok.kind, ok.canViewRecord], ['ACTIVE', true]);
});
test('family access: only the LATEST consent counts', () => {
  const cs = [{ patient: 'p', status: 'APPROVED', created_at: '2026-09-01T00:00:00Z' }, { patient: 'p', status: 'DECLINED', created_at: '2026-09-05T00:00:00Z' }, { patient: 'q', status: 'APPROVED', created_at: '2026-09-09T00:00:00Z' }];
  assert.equal(latestConsentStatus(cs, 'p'), 'DECLINED');
  assert.equal(latestConsentStatus(cs, 'zzz'), null);
});

test('consent: only the patient is ever offered a decision', () => {
  for (const role of ['FAMILY', 'HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN']) for (const st of ['PENDING', 'APPROVED', 'DECLINED']) assert.deepEqual(consentChoices(st, role), [], `${role}/${st}`);
  assert.deepEqual(consentChoices('PENDING', 'PATIENT').map((c) => c.action), ['APPROVE', 'DECLINE', 'ASK_DOCTOR']);
  assert.deepEqual(consentChoices('APPROVED', 'PATIENT').map((c) => c.action), ['DECLINE']);
  assert.deepEqual(consentChoices('DECLINED', 'PATIENT').map((c) => c.action), ['APPROVE']);
  assert.deepEqual(consentChoices('SOMETHING_ELSE', 'PATIENT'), []);
});
test('consent: pending first, then newest', () => {
  const l = [{ id: 1, status: 'APPROVED', created_at: '2026-09-09T00:00:00Z' }, { id: 2, status: 'PENDING', created_at: '2026-09-01T00:00:00Z' }, { id: 3, status: 'DECLINED', created_at: '2026-09-10T00:00:00Z' }];
  assert.deepEqual(sortConsents(l).map((x) => x.id), [2, 1, 3]);
});

const N = (id, is_read, type = 'GENERAL') => ({ id, is_read, notification_type: type });
test('notifications: unread filter and count', () => {
  const l = [N(1, false), N(2, true), N(3, false)];
  assert.equal(unreadCount(l), 2); assert.deepEqual(filterNotifications(l, 'UNREAD').map((n) => n.id), [1, 3]); assert.equal(filterNotifications(l, 'ALL').length, 3);
});
test('notifications: links go only to pages the role really has; unknown types have none', () => {
  assert.equal(notificationHref('ACCESS_REQUEST', 'PATIENT'), '/portal/access-requests');
  assert.equal(notificationHref('ACCESS_REQUEST', 'FAMILY'), null);
  assert.equal(notificationHref('ACCESS_REQUEST', 'HOSPITAL_STAFF'), null);
  assert.equal(notificationHref('NEW_CONSENT', 'FAMILY'), '/portal/consents');
  assert.equal(notificationHref('GENERAL', 'PATIENT'), null);
  assert.equal(notificationMeta('EMERGENCY_ACCESS').tone, 'danger');
});

import { fileExtension } from './documentRules.ts';
test('display name: recovers the original name from <uuid>_<name>', () => {
  assert.equal(displayName('http://h/media/patients/p/documents/5477ec42-56c8-47b9-983c-5c7d284f9a11_Blood report.pdf'), 'Blood report.pdf');
});
test('display name: a truncated/garbled storage name falls back, never shows a raw id', () => {
  const garbled = 'http://h/media/patients/p/documents/5477ec42-56c8-47b9-983c-5c7d284_8n9ZKae.docx';
  assert.equal(displayName(garbled, 'Other (DOCX)'), 'Other (DOCX)');
  assert.equal(displayName('http://h/x/', 'Fallback'), 'Fallback');
  assert.equal(fileExtension(garbled), 'docx');
  assert.equal(fileExtension('http://h/x/noext'), '');
});
