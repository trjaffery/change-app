import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Surfaces the webhook URL + bearer token + last-received timestamp to the
 * Settings page so the user can paste them into their iOS Shortcut. Cookie-
 * authed via middleware — the token only leaves the server when the request
 * already presents the session cookie.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.HEALTH_IMPORT_SECRET ?? null;
  const origin = req.nextUrl.origin;

  const { data } = await supabaseServer()
    .from('health_metrics')
    .select('date, steps, sleep_minutes, posted_at')
    .order('posted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    endpoint: `${origin}/api/health-import/webhook`,
    token: secret,
    configured: !!secret,
    last: data ?? null,
  });
}
