import { cookies } from 'next/headers';

const ACCESS_COOKIE = 'll_access';
const REFRESH_COOKIE = 'll_refresh';

// Access tokens are short-lived (15 min server-side) so the cookie maxAge
// is generous but the token itself expires quickly server-side regardless.
const ACCESS_MAX_AGE = 60 * 60; // 1 hour cookie lifetime, token expires in 15 min
const REFRESH_MAX_AGE = 60 * 60 * 24; // 1 day, matches SIMPLE_JWT REFRESH_TOKEN_LIFETIME

const isProd = process.env.NODE_ENV === 'production';

export async function setSessionTokens(access: string, refresh: string) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, access, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  });
  store.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value;
}

export async function clearSessionTokens() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
