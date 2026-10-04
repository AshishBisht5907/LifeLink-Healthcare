import { NextResponse } from 'next/server';
import { clearSessionTokens } from '@/lib/session';

export async function POST() {
  await clearSessionTokens();
  return NextResponse.json({ detail: 'Logged out.' });
}
