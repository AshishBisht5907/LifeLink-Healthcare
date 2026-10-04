import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAccess, activeGrant } from './accessState.ts';

const NOW = new Date('2026-09-30T12:00:00Z').getTime();
const grant = (o = {}) => ({ id: 'g', patient_id: 'p1', grant_type: 'NORMAL', status: 'PENDING', created_at: '2026-09-30T10:00:00Z', expires_at: null, ...o });
const masked = (access) => ({ id: 'p1', access, can_request_access: true });
const inScope = { id: 'p1', access: 'GRANTED' };

test('no history: not requested, can request, cannot open', () => {
  const s = describeAccess('p1', masked('NONE'), [], NOW);
  assert.deepEqual([s.kind, s.canOpen, s.canRequest], ['NOT_REQUESTED', false, true]);
});
test('pending blocks a second request', () => {
  const s = describeAccess('p1', masked('PENDING'), [grant()], NOW);
  assert.deepEqual([s.kind, s.canRequest], ['PENDING', false]);
});
test('declined / revoked / expired allow asking again but never open', () => {
  for (const [st, kind] of [['DECLINED', 'DECLINED'], ['REVOKED', 'REVOKED'], ['EXPIRED', 'EXPIRED']]) {
    const s = describeAccess('p1', masked(st), [grant({ status: st })], NOW);
    assert.deepEqual([s.kind, s.canOpen, s.canRequest], [kind, false, true]);
  }
});
test('server GRANTED + live emergency grant = EMERGENCY with expiry', () => {
  const g = grant({ grant_type: 'EMERGENCY', status: 'APPROVED', expires_at: '2026-09-30T15:00:00Z' });
  const s = describeAccess('p1', inScope, [g], NOW);
  assert.deepEqual([s.kind, s.canOpen, s.until], ['EMERGENCY', true, '2026-09-30T15:00:00Z']);
});
test('server GRANTED + live normal grant = APPROVED', () => {
  const g = grant({ status: 'APPROVED', expires_at: '2026-09-30T15:00:00Z' });
  assert.equal(describeAccess('p1', inScope, [g], NOW).kind, 'APPROVED');
});
test('own-hospital patient with no grant = HOSPITAL', () => {
  assert.equal(describeAccess('p1', inScope, [], NOW).kind, 'HOSPITAL');
});
test('emergency grant past its end reads as emergency expired, not open', () => {
  const g = grant({ grant_type: 'EMERGENCY', status: 'EXPIRED', expires_at: '2026-09-30T09:00:00Z' });
  const s = describeAccess('p1', masked('EXPIRED'), [g], NOW);
  assert.deepEqual([s.kind, s.canOpen], ['EMERGENCY_EXPIRED', false]);
});
test('an approved grant whose time has passed is never treated as active', () => {
  const g = grant({ status: 'APPROVED', expires_at: '2026-09-30T09:00:00Z' });
  assert.equal(activeGrant([g], 'p1', NOW), null);
  assert.equal(describeAccess('p1', masked('APPROVED'), [g], NOW).canOpen, false);
});
test('detail page (no search row) still resolves from grants alone', () => {
  const g = grant({ status: 'DECLINED' });
  assert.equal(describeAccess('p1', null, [g], NOW).kind, 'DECLINED');
  assert.equal(describeAccess('p1', null, [], NOW).kind, 'NOT_REQUESTED');
});

import { groupPatientGrants, kindOfGrant } from './accessState.ts';
const G = (o) => ({ id: 'x', patient_id: 'p1', grant_type: 'NORMAL', status: 'PENDING', created_at: '2026-09-30T10:00:00Z', expires_at: null, ...o });

test('groups: pending normal / active / history', () => {
  const g = groupPatientGrants([
    G({ id: 'a', status: 'PENDING' }),
    G({ id: 'b', status: 'APPROVED', expires_at: '2026-09-30T15:00:00Z' }),
    G({ id: 'c', status: 'DECLINED' }),
    G({ id: 'd', status: 'REVOKED' }),
    G({ id: 'e', status: 'EXPIRED' }),
  ], NOW);
  assert.deepEqual([g.pending.length, g.active.length, g.history.length], [1, 1, 3]);
});
test('an approved grant past its end time is history, never active', () => {
  const g = groupPatientGrants([G({ status: 'APPROVED', expires_at: '2026-09-30T09:00:00Z' })], NOW);
  assert.deepEqual([g.active.length, g.history.length], [0, 1]);
});
test('emergency access is active but never "pending"', () => {
  const g = groupPatientGrants([G({ grant_type: 'EMERGENCY', status: 'APPROVED', expires_at: '2026-09-30T15:00:00Z' })], NOW);
  assert.deepEqual([g.pending.length, g.active.length], [0, 1]);
  assert.equal(kindOfGrant(g.active[0]), 'EMERGENCY');
});
test('empty in, empty out', () => {
  const g = groupPatientGrants([], NOW);
  assert.deepEqual([g.pending, g.active, g.history], [[], [], []]);
});
