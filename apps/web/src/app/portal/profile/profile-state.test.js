import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPatientProfileData } from './profile-state.js';

test('missing patient payload is treated as unavailable data', () => {
  assert.equal(hasPatientProfileData(null), false);
  assert.equal(hasPatientProfileData(undefined), false);
});

test('valid patient payload passes through as usable profile data', () => {
  assert.equal(hasPatientProfileData({ full_name: 'Rahul Sharma' }), true);
});
