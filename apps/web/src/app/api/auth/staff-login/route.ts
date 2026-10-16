import { NextRequest, NextResponse } from 'next/server';
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

    return NextResponse.json({ user: data.user, access: data.access, refresh: data.refresh });
  } catch (error) {
    console.error('LifeLink staff login API error:', error);
    return NextResponse.json({ message: 'Could not connect to Django. Check that the backend is running on 127.0.0.1:8000.' }, { status: 503 });
  }
}
