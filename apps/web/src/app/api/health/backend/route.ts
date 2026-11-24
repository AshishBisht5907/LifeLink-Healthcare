import { NextResponse } from 'next/server';
import { DJANGO_API_URL } from '@/lib/serverApi';

export const runtime = 'nodejs';

/**
 * Checks connectivity from the Next.js server to Django. The unauthenticated
 * /api/auth/me/ endpoint is expected to return 401; any HTTP response proves
 * that the upstream server was reached.
 */
export async function GET() {
  try {
    const response = await fetch(`${DJANGO_API_URL}/api/auth/me/`, {
      method: 'GET',
      cache: 'no-store',
    });

    return NextResponse.json({
      reachable: true,
      upstreamStatus: response.status,
    });
  } catch (error) {
    console.error('LifeLink backend health check failed:', {
      url: DJANGO_API_URL,
      error,
    });
    return NextResponse.json({
      reachable: false,
      message: 'Next.js could not connect to the configured Django API. Check DJANGO_API_URL.',
    }, { status: 503 });
  }
}
