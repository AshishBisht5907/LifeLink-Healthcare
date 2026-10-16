import { NextRequest, NextResponse } from 'next/server';
import { setSessionTokens } from '@/lib/session';
import { DJANGO_API_URL } from '@/lib/serverApi';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const resp = await fetch(`${DJANGO_API_URL}/api/auth/staff/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) return NextResponse.json(data, { status: resp.status });
    if (!data.access || !data.refresh || !data.user) {
      return NextResponse.json({ message: 'Login response was incomplete. Check the Django auth endpoint.' }, { status: 502 });
    }

    // Match the OTP login flow: persist JWTs as httpOnly cookies so /auth/me
    // and protected pages can authenticate the user after the redirect.
    await setSessionTokens(data.access, data.refresh);
    // Keep access and refresh tokens out of browser JavaScript.
    return NextResponse.json({ user: data.user });
  } catch (error) {
    console.error('LifeLink staff login API error:', error);
    return NextResponse.json({ message: 'Could not connect to Django. Check that the backend is running on 127.0.0.1:8000.' }, { status: 503 });
  }
}
