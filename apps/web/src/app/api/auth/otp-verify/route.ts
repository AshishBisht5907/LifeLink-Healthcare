import { NextRequest, NextResponse } from 'next/server';
import { setSessionTokens } from '@/lib/session';

const DJANGO_API_URL = process.env.DJANGO_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const resp = await fetch(`${DJANGO_API_URL}/api/auth/otp/verify/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await resp.json();

  if (!resp.ok) {
    return NextResponse.json(data, { status: resp.status });
  }

  await setSessionTokens(data.access, data.refresh);
  return NextResponse.json({ user: data.user });
}
