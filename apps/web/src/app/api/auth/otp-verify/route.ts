import { NextRequest, NextResponse } from 'next/server';
import { setSessionTokens } from '@/lib/session';
import { DJANGO_API_URL } from '@/lib/serverApi';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const resp = await fetch(`${DJANGO_API_URL}/api/auth/otp/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) return NextResponse.json(data, { status: resp.status });
    if (!data.access || !data.refresh || !data.user) {
      return NextResponse.json({ message: 'Verification response was incomplete. Check the Django auth endpoint.' }, { status: 502 });
    }

    await setSessionTokens(data.access, data.refresh);
    return NextResponse.json({ user: data.user });
  } catch (error) {
    console.error('LifeLink OTP verification API error:', error);
    return NextResponse.json({ message: 'Could not connect to Django. Check that the backend is running on 127.0.0.1:8000.' }, { status: 503 });
  }
}
