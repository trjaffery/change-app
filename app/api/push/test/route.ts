import { NextRequest, NextResponse } from 'next/server';
import { sendPush, sendPushToAll, type StoredSubscription } from '@/lib/push';
import { supabaseServer } from '@/lib/supabase';

/**
 * Stage 1 verification endpoint. If `endpoint` is in the body, sends only
 * to that subscription (useful for "test this device" from Settings).
 * Otherwise fans out to every stored subscription.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { endpoint?: string };
  // Title intentionally != app name. iOS shows the app name automatically
  // as a "from Change" subtitle below; a duplicate title looks redundant.
  const payload = {
    title: 'Test push',
    body: 'Notifications are wired up. You\'ll see real ones soon.',
    url: '/settings',
    tag: 'test',
  };

  try {
    if (body.endpoint) {
      const sb = supabaseServer();
      const { data } = await sb.from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('endpoint', body.endpoint)
        .maybeSingle();
      if (!data) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
      const ok = await sendPush(data as StoredSubscription, payload);
      return NextResponse.json({ sent: ok ? 1 : 0, failed: ok ? 0 : 1 });
    }
    const result = await sendPushToAll(payload);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
