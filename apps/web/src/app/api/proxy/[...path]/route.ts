import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, getRefreshToken, setSessionTokens, clearSessionTokens } from '@/lib/session';

const DJANGO_API_URL = process.env.DJANGO_API_URL || 'http://localhost:8000';

async function tryRefresh(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const resp = await fetch(`${DJANGO_API_URL}/api/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  await setSessionTokens(data.access, data.refresh);
  return data.access as string;
}

async function forward(req: NextRequest, pathParts: string[]): Promise<NextResponse> {
  const path = pathParts.join('/');
  const search = req.nextUrl.search;
  const url = `${DJANGO_API_URL}/api/${path}/${search}`;

  const accessToken = await getAccessToken();
  const isMultipart = req.headers.get('content-type')?.includes('multipart/form-data');

  const buildHeaders = (token?: string) => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isMultipart && req.method !== 'GET' && req.method !== 'DELETE') {
      headers['Content-Type'] = req.headers.get('content-type') || 'application/json';
    }
    return headers;
  };

  const getBody = async (): Promise<BodyInit | undefined> => {
    if (req.method === 'GET' || req.method === 'HEAD') return undefined;
    if (isMultipart) return await req.formData();
    const text = await req.text();
    return text || undefined;
  };

  const body = await getBody();

  let resp = await fetch(url, { method: req.method, headers: buildHeaders(accessToken), body, cache: 'no-store' });

  // Transparent one-shot refresh on an expired access token — the client
  // never has to know this happened.
  if (resp.status === 401 && accessToken) {
    const newToken = await tryRefresh();
    if (newToken) {
      resp = await fetch(url, { method: req.method, headers: buildHeaders(newToken), body, cache: 'no-store' });
    } else {
      await clearSessionTokens();
    }
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  }
  if (resp.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  // Binary passthrough (e.g. document downloads).
  const buf = await resp.arrayBuffer();
  return new NextResponse(buf, {
    status: resp.status,
    headers: {
      'content-type': contentType,
      'content-disposition': resp.headers.get('content-disposition') || '',
    },
  });
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function POST(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function PUT(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  const { path } = await ctx.params;
  return forward(req, path);
}
