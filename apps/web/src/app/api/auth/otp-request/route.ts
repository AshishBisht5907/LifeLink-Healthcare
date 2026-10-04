import { NextRequest, NextResponse } from 'next/server';

const DJANGO_API_URL = process.env.DJANGO_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const resp = await fetch(`${DJANGO_API_URL}/api/auth/otp/request/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
