import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJourney, buildRequestSteps } from './careJourney.ts';

const req = (o = {}) => ({
  id: 'r1', admission: 'a1', request_type: 'CT_SCAN', status: 'REQUESTED', priority: 'NORMAL',
  department_name: 'Radiology', assigned_to: null, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z',
  completed_at: null, postpone_or_reject_reason: '', transitions: [], ...o,
});
const tr = (id, from, to, at, extra = {}) => ({ id, from_status: from, to_status: to, created_at: at, changed_by_username: 'dr_house', note: 'internal', ...extra });
const adm = (o = {}) => ({ id: 'a1', hospital_name: 'ABC', admission_number: 'A-1', status: 'ACTIVE', admitted_at: '2026-09-01T09:00:00Z', discharged_at: null, ...o });
const states = (steps) => steps.map((s) => `${s.state}:${s.title}`);

test('new request: created is the current step, only Completion is pending', () => {
  const s = buildRequestSteps(req(), 'patient');
  assert.deepEqual(states(s), ['current:Request created', 'pending:Completion']);
});

test('history comes from real transitions, current = live status', () => {
  const s = buildRequestSteps(req({ status: 'IN_PROGRESS', transitions: [
    tr('t1', 'REQUESTED', 'APPROVED', '2026-09-01T11:00:00Z'), tr('t2', 'APPROVED', 'IN_PROGRESS', '2026-09-01T12:00:00Z')] }), 'patient');
  assert.deepEqual(states(s), ['done:Request created', 'done:Approved', 'current:In progress', 'pending:Completion']);
  assert.equal(s[1].at, '2026-09-01T11:00:00Z');
});

test('nothing invented: no approval/doctor/consultation steps for a bare request', () => {
  const titles = buildRequestSteps(req(), 'patient').map((s) => s.title.toLowerCase()).join('|');
  for (const fake of ['management', 'doctor', 'consultation', 'treatment', 'follow']) assert.ok(!titles.includes(fake));
});

test('completed has no pending step and uses completed_at when not logged', () => {
  const s = buildRequestSteps(req({ status: 'COMPLETED', completed_at: '2026-09-02T08:00:00Z' }), 'patient');
  assert.deepEqual(states(s), ['done:Request created', 'done:Completed']);
  assert.equal(s[1].at, '2026-09-02T08:00:00Z');
});

test('live status without a logged transition is current and has NO timestamp', () => {
  const s = buildRequestSteps(req({ status: 'READY' }), 'patient');
  const cur = s.find((x) => x.state === 'current');
  assert.equal(cur.title, 'Ready');
  assert.equal(cur.at, undefined);
});

test('rejected/postponed show as problems with the reason, and no fake completion', () => {
  const rej = buildRequestSteps(req({ status: 'REJECTED', postpone_or_reject_reason: 'Wrong test', transitions: [tr('t', 'REQUESTED', 'REJECTED', '2026-09-01T11:00:00Z')] }), 'patient');
  assert.deepEqual(states(rej), ['done:Request created', 'problem:Rejected']);
  assert.equal(rej[1].detail, 'Wrong test');
  const post = buildRequestSteps(req({ status: 'POSTPONED', transitions: [tr('t', 'REQUESTED', 'POSTPONED', '2026-09-01T11:00:00Z')] }), 'patient');
  assert.ok(!states(post).some((x) => x.startsWith('pending')));
});

test('patients never get staff usernames or internal notes; staff do', () => {
  const r = req({ status: 'APPROVED', transitions: [tr('t', 'REQUESTED', 'APPROVED', '2026-09-01T11:00:00Z')] });
  assert.equal(buildRequestSteps(r, 'patient')[1].detail, undefined);
  assert.match(buildRequestSteps(r, 'staff')[1].detail, /dr_house/);
});

test('assignment is a flag only, never a timeline event', () => {
  const j = buildJourney({ admissions: [adm()], requests: [req({ assigned_to: 'u1' })], referrals: [] });
  assert.equal(j.episodes[0].requests[0].assigned, true);
  assert.ok(!j.episodes[0].requests[0].steps.some((s) => /assign/i.test(s.title)));
});

test('stay: active is current, discharged is done with time', () => {
  assert.deepEqual(states(buildJourney({ admissions: [adm()], requests: [], referrals: [] }).episodes[0].stay), ['done:Admitted to ABC', 'current:Currently admitted']);
  const d = buildJourney({ admissions: [adm({ status: 'DISCHARGED', discharged_at: '2026-09-05T09:00:00Z' })], requests: [], referrals: [] }).episodes[0].stay;
  assert.deepEqual(states(d), ['done:Admitted to ABC', 'done:Discharged']);
});

test('referral lifecycle', () => {
  const ref = (o) => ({ id: 'f1', from_admission: 'a1', to_hospital_name: 'City', required_department_type: 'CARDIOLOGY', status: 'PENDING', created_at: '2026-09-01T10:00:00Z', responded_at: null, response_note: 'x', ...o });
  const p = buildJourney({ admissions: [adm()], requests: [], referrals: [ref({})] });
  assert.deepEqual(states(p.episodes[0].referrals[0].steps), ['done:Referral sent to City', 'current:Waiting for City to respond']);
  assert.equal(p.summary.pendingReferrals, 1);
  const ok = buildJourney({ admissions: [adm()], requests: [], referrals: [ref({ status: 'ACCEPTED', responded_at: '2026-09-01T12:00:00Z' })], transfers: { f1: { completed_at: '2026-09-01T15:00:00Z', new_admission: 'n1' } } });
  assert.deepEqual(states(ok.episodes[0].referrals[0].steps), ['done:Referral sent to City', 'done:Accepted by City', 'done:Transfer completed']);
  const no = buildJourney({ admissions: [adm()], requests: [], referrals: [ref({ status: 'REJECTED', responded_at: '2026-09-01T12:00:00Z' })] });
  assert.equal(no.episodes[0].referrals[0].steps[1].state, 'problem');
  assert.equal(no.episodes[0].referrals[0].steps[1].detail, undefined); // patient can't see the response note
});

test('empty data, and headline only from real facts', () => {
  const e = buildJourney({ admissions: [], requests: [], referrals: [] });
  assert.equal(e.isEmpty, true);
  assert.equal(e.summary.headline, null);
  const j = buildJourney({ admissions: [adm()], requests: [req({ status: 'IN_PROGRESS' }), req({ id: 'r2', status: 'COMPLETED' })], referrals: [] });
  assert.equal(j.summary.headline, 'Currently admitted at ABC · 1 request in progress');
});

test('items not tied to a known admission are kept, not dropped', () => {
  const j = buildJourney({ admissions: [], requests: [req({ admission: 'zzz' })], referrals: [] });
  assert.equal(j.episodes.length, 1);
  assert.equal(j.episodes[0].admission, null);
});
