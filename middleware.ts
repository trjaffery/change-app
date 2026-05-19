import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.APP_TOKEN;
const COOKIE = 'app_token';
const PUBLIC_PATHS = ['/login', '/api/auth'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check token query param first — works from any path including /login
  const qToken = req.nextUrl.searchParams.get('token');
  if (qToken && qToken === TOKEN) {
    const url = req.nextUrl.clone();
    url.searchParams.delete('token');
    if (url.pathname === '/login') url.pathname = '/';
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, TOKEN!, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === TOKEN) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
