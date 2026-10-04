import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRequests, filterRequests, requestCounts, isUrgent, mineOnly, filterAdmissions, admissionCounts, referralDirection, filterReferrals, referralCounts, capacityStats, validateCapacity } from './listViews.ts';

const R = (o) => ({ id: 'r', status: 'PENDING', priority: 'NORMAL', created_at: '2026-09-01T10:00:00Z', created_by: 'u1', assigned_to: null, ...o });

test('open requests: urgent first, then longest waiting; resolved last, newest first', () => {
  const s = sortRequests([
    R({ id: 'done-old', status: 'COMPLETED', created_at: '2026-08-01T00:00:00Z' }),
    R({ id: 'normal-new', created_at: '2026-09-03T00:00:00Z' }),
    R({ id: 'normal-old', created_at: '2026-09-01T00:00:00Z' }),
    R({ id: 'emerg', priority: 'EMERGENCY', created_at: '2026-09-04T00:00:00Z' }),
    R({ id: 'done-new', status: 'REJECTED', created_at: '2026-09-02T00:00:00Z' }),
  ]).map((r) => r.id);
  assert.deepEqual(s, ['emerg', 'normal-old', 'normal-new', 'done-new', 'done-old']);
});
test('urgent means open AND high/emergency; a completed emergency is not urgent', () => {
  assert.equal(isUrgent(R({ priority: 'EMERGENCY' })), true);
  assert.equal(isUrgent(R({ priority: 'HIGH', status: 'IN_PROGRESS' })), true);
  assert.equal(isUrgent(R({ priority: 'EMERGENCY', status: 'COMPLETED' })), false);
  assert.equal(isUrgent(R({ priority: 'NORMAL' })), false);
});
test('groups and counts partition every status exactly once', () => {
  const all = ['REQUESTED','PENDING','APPROVAL_REQUIRED','APPROVED','READY','IN_PROGRESS','POSTPONED','BLOCKED','COMPLETED','CANCELLED','REJECTED'].map((s, i) => R({ id: String(i), status: s }));
  const c = requestCounts(all);
  assert.equal(c.NEEDS_ACTION + c.IN_PROGRESS + c.ON_HOLD + c.RESOLVED, c.ALL);
  assert.equal(filterRequests(all, 'ON_HOLD').length, 2);
  assert.equal(filterRequests(all, 'ALL').length, 11);
});
test('"mine" is created-by or assigned-to me, and nothing without a user id', () => {
  const l = [R({ id: 'a', created_by: 'me' }), R({ id: 'b', assigned_to: 'me' }), R({ id: 'c' })];
  assert.deepEqual(mineOnly(l, 'me').map((r) => r.id), ['a', 'b']);
  assert.deepEqual(mineOnly(l, null), []);
});

const A = (o) => ({ id: 'a', patient_name: 'Riya Sharma', admission_number: 'ADM-1', status: 'ACTIVE', admitted_at: '2026-09-01T00:00:00Z', ...o });
test('admissions: active first, then newest; search by name or number', () => {
  const l = [A({ id: '1', status: 'DISCHARGED', admitted_at: '2026-09-05T00:00:00Z' }), A({ id: '2', admitted_at: '2026-08-01T00:00:00Z' }), A({ id: '3', patient_name: 'Amit Verma', admission_number: 'ADM-9' })];
  assert.deepEqual(filterAdmissions(l, 'ALL', '').map((a) => a.id), ['3', '2', '1']);
  assert.deepEqual(filterAdmissions(l, 'ALL', 'amit').map((a) => a.id), ['3']);
  assert.deepEqual(filterAdmissions(l, 'ALL', 'adm-9').map((a) => a.id), ['3']);
  assert.deepEqual(filterAdmissions(l, 'DISCHARGED', '').map((a) => a.id), ['1']);
  assert.deepEqual(admissionCounts(l), { ALL: 3, ACTIVE: 2, DISCHARGED: 1, TRANSFERRED: 0 });
});

const F = (o) => ({ id: 'f', from_hospital: 'H1', to_hospital: 'H2', status: 'PENDING', created_at: '2026-09-01T00:00:00Z', ...o });
test('referral direction is decided by hospital id, and unrelated referrals have none', () => {
  assert.equal(referralDirection(F({}), 'H1'), 'OUTGOING');
  assert.equal(referralDirection(F({}), 'H2'), 'INCOMING');
  assert.equal(referralDirection(F({}), 'H3'), null);
  assert.equal(referralDirection(F({}), undefined), null);
});
test('referral tabs and counts', () => {
  const l = [F({ id: '1' }), F({ id: '2', from_hospital: 'H2', to_hospital: 'H1', status: 'ACCEPTED' })];
  assert.deepEqual(filterReferrals(l, 'INCOMING', 'H1').map((r) => r.id), ['2']);
  assert.deepEqual(referralCounts(l, 'H1'), { ALL: 2, OUTGOING: 1, INCOMING: 1, AWAITING: 1 });
});
test('capacity: occupied = total - available; tone by % free; never negative', () => {
  assert.deepEqual(capacityStats({ total: 10, available: 4 }), { total: 10, available: 4, occupied: 6, pctFree: 40, tone: 'ok' });
  assert.equal(capacityStats({ total: 10, available: 3 }).tone, 'low');
  assert.equal(capacityStats({ total: 10, available: 1 }).tone, 'critical');
  assert.equal(capacityStats({ total: 0, available: 0 }).tone, 'unset');
  assert.equal(capacityStats({ total: 5, available: 9 }).occupied, 0);
});
test('capacity form validation', () => {
  assert.equal(validateCapacity(10, 4), null);
  assert.match(validateCapacity(4, 10), /more than the total/);
  assert.match(validateCapacity(-1, 0), /negative/);
  assert.match(validateCapacity(1.5, 1), /whole/);
});

import { tally, openRequests } from './listViews.ts';
test('tally: exact on the last page, a floor ("N+") when more pages exist, null while unknown', () => {
  const page = (next) => ({ count: 3, next, results: [{ s: 1 }, { s: 2 }, { s: 1 }] });
  assert.equal(tally(page(null), (x) => x.s === 1), '2');
  assert.equal(tally(page('http://more'), (x) => x.s === 1), '2+');
  assert.equal(tally(null, () => true), null);
});
test('openRequests drops resolved work and keeps urgent-first order', () => {
  const l = [R({ id: 'done', status: 'COMPLETED' }), R({ id: 'n', created_at: '2026-09-02T00:00:00Z' }), R({ id: 'e', priority: 'EMERGENCY', created_at: '2026-09-03T00:00:00Z' })];
  assert.deepEqual(openRequests(l).map((r) => r.id), ['e', 'n']);
});
