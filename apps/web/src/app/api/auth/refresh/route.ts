import { NextResponse } from 'next/server';
import { getRefreshToken, setSessionTokens, clearSessionTokens } from '@/lib/session';
import { DJANGO_API_URL } from '@/lib/serverApi';

/** Restore an expired access JWT using the httpOnly refresh cookie. */
export async function POST() {
  const refresh = await getRefreshToken();
  if (!refresh) {
    return NextResponse.json({ message: 'No refresh session is available.' }, { status: 401 });
  }

  try {
    const resp = await fetch(`${DJANGO_API_URL}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
      cache: 'no-store',
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data.access) {
      if (resp.status === 401 || resp.status === 400) await clearSessionTokens();
      return NextResponse.json(data, { status: resp.ok ? 502 : resp.status });
    }

    // Persist a rotated refresh token when Django is configured to rotate it.
    await setSessionTokens(data.access, data.refresh || refresh);
    return NextResponse.json({ restored: true });
  } catch {
    // A temporary backend outage must not erase a still-valid refresh cookie.
    return NextResponse.json({ message: 'Could not reach the authentication service.' }, { status: 503 });
  }
}
