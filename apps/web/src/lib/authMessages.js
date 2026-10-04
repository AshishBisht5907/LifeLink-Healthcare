export function otpWelcomeMessage(mode) {
  return mode === 'REGISTER' ? 'Your account has been created.' : 'Welcome back.';
}
