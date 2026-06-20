import webpush from 'web-push';
import { supabaseServer } from '@/lib/supabase';

let configured = false;

/**
 * Lazy VAPID setup. Reads keys from env on first call. Throws if any are
 * missing so the route handler can surface a clear error rather than silently
 * dropping the send.
 */
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:trjaffery04@gmail.com';
  if (!pub || !priv) {
    throw new Error('VAPID keys not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;            // where notificationclick should route to
  tag?: string;            // groups/collapses repeat notifications
  requireInteraction?: boolean;
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a push to a single subscription. Returns true on success.
 * On 404/410 (subscription expired or unsubscribed) the row is deleted so
 * we stop sending to dead endpoints.
 */
export async function sendPush(sub: StoredSubscription, payload: PushPayload): Promise<boolean> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 }, // 12h — drop the notification if device is offline that long
    );
    // Best-effort timestamp; failures here aren't fatal.
    await supabaseServer().from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', sub.id);
    return true;
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      // Subscription is gone on the push service side — clean it up.
      await supabaseServer().from('push_subscriptions').delete().eq('id', sub.id);
    } else {
      console.error('[push] send failed', sub.endpoint.slice(0, 60), status, e);
    }
    return false;
  }
}

/**
 * Fan out a payload to every stored subscription. Returns counts so the
 * cron handler can log progress.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const sb = supabaseServer();
  const { data } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  const subs = (data ?? []) as StoredSubscription[];
  const results = await Promise.all(subs.map(s => sendPush(s, payload)));
  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent };
}
