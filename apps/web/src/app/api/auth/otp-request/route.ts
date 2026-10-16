import { NextRequest, NextResponse } from 'next/server';
import { DJANGO_API_URL } from '@/lib/serverApi';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const resp = await fetch(`${DJANGO_API_URL}/api/auth/otp/request/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    console.error('LifeLink OTP request API error:', error);
    return NextResponse.json({ message: 'Could not connect to Django. Check that the backend is running on 127.0.0.1:8000.' }, { status: 503 });
  }
}
