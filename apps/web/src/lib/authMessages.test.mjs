import test from 'node:test';
import assert from 'node:assert/strict';
import { otpWelcomeMessage } from './authMessages.js';

test('signup welcome message is only shown for new registration', () => {
  assert.equal(otpWelcomeMessage('REGISTER'), 'Your account has been created.');
  assert.equal(otpWelcomeMessage('LOGIN'), 'Welcome back.');
});
