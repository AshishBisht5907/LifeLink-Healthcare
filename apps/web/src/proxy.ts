import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIXES = ['/staff', '/management', '/admin', '/portal'];
const PUBLIC_PATHS = ['/login', '/'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('ll_access');

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already logged in and hitting the public landing/login pages? Send them
  // onward — role-specific redirect happens client-side once /me resolves.
  if (hasSession && PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/redirect', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
