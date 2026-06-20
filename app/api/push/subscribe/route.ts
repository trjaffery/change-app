import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label?: string;
}

/**
 * Upsert by endpoint — re-subscribing on the same device (which iOS will do
 * periodically) just refreshes the row instead of creating duplicates.
 */
export async function POST(req: NextRequest) {
  const sub = await req.json() as SubscribeBody;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
  }

  const ua = req.headers.get('user-agent') ?? null;
  const sb = supabaseServer();
  const { error } = await sb.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: ua,
    label: sub.label ?? null,
  }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = await req.json() as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  const sb = supabaseServer();
  const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

// Useful for the Settings page to show "this device is subscribed."
export async function GET(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ subscribed: false });
  const sb = supabaseServer();
  const { data } = await sb.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle();
  return NextResponse.json({ subscribed: !!data });
}
