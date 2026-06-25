import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.APP_TOKEN;
const COOKIE = 'app_token';
// /api/cron has its own bearer-auth via CRON_SECRET — letting it through the
// cookie gate is the only way GitHub Actions can call it without holding our
// session cookie. The route handler itself rejects anything without the secret.
// /api/health-import/webhook is the same shape: an iOS Shortcut posts to it
// with a HEALTH_IMPORT_SECRET bearer token. Note this exempts the /webhook
// child path only — startsWith on the bare /api/health-import would also
// expose the /config and data-read endpoints which need cookie auth.
const PUBLIC_PATHS = ['/login', '/api/auth', '/api/cron', '/api/health-import/webhook'];

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
