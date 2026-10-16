import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, getRefreshToken, setSessionTokens, clearSessionTokens } from '@/lib/session';
import { DJANGO_API_URL } from '@/lib/serverApi';

async function tryRefresh(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  try {
    const resp = await fetch(`${DJANGO_API_URL}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.access) return null;
    await setSessionTokens(data.access, data.refresh || refresh);
    return data.access as string;
  } catch {
    return null;
  }
}

async function forward(req: NextRequest, pathParts: string[]): Promise<NextResponse> {
  const path = pathParts.join('/');
  const search = req.nextUrl.search;
  const url = `${DJANGO_API_URL}/api/${path}/${search}`;
  const accessToken = await getAccessToken();
  const isMultipart = req.headers.get('content-type')?.includes('multipart/form-data');

  const buildHeaders = (token?: string) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
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

  try {
    const body = await getBody();
    let resp = await fetch(url, { method: req.method, headers: buildHeaders(accessToken), body, cache: 'no-store' });

    if (resp.status === 401 && accessToken) {
      const newToken = await tryRefresh();
      if (newToken) {
        // Only replay buffered text/JSON bodies. Multipart forms cannot safely be reused.
        if (!isMultipart) {
          resp = await fetch(url, { method: req.method, headers: buildHeaders(newToken), body, cache: 'no-store' });
        }
      } else {
        await clearSessionTokens();
      }
    }

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await resp.json().catch(() => ({}));
      return NextResponse.json(data, { status: resp.status });
    }
    if (resp.status === 204) return new NextResponse(null, { status: 204 });

    const buf = await resp.arrayBuffer();
    return new NextResponse(buf, {
      status: resp.status,
      headers: {
        'content-type': contentType,
        ...(resp.headers.get('content-disposition') ? { 'content-disposition': resp.headers.get('content-disposition')! } : {}),
      },
    });
  } catch (error) {
    console.error('LifeLink API proxy error:', error);
    return NextResponse.json({
      error: true,
      code: 503,
      message: 'LifeLink backend is unreachable. Check that Django is running on 127.0.0.1:8000.',
    }, { status: 503 });
  }
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/proxy/[...path]'>) {
  return forward(req, (await ctx.params).path);
}
