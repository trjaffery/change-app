import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.APP_TOKEN;
const COOKIE = 'app_token';

export async function POST(req: NextRequest) {
  const { token } = await req.json() as { token?: string };
  if (!token || token !== TOKEN) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, TOKEN!, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return res;
}
