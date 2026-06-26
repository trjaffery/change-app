import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Webhook for the iOS Shortcut that uploads steps + sleep from HealthKit.
 *
 * Bearer-auth with HEALTH_IMPORT_SECRET — iOS Shortcuts can't carry cookies,
 * and this path is exempt from the app_token middleware so the Shortcut can
 * hit it with just the header.
 *
 * Body: { date?: 'YYYY-MM-DD', steps?: number, sleep_minutes?: number }
 *
 *   • If `date` is omitted, the server derives the active date itself using
 *     the user's saved timezone + the 6 AM day-boundary convention from
 *     lib/dates.ts. This keeps a 1 AM Sync tap attributed to "yesterday's"
 *     row (matching the rest of the app) even though the iPhone's "today"
 *     has already rolled over.
 *   • If `date` is provided, it's used as-is — for explicit backfills.
 *
 * Either metric is optional so the morning Shortcut can post just sleep and
 * the evening one can post just steps against the same row.
 */

/**
 * Compute the active YYYY-MM-DD in `tz`, treating anything before 6 AM as
 * still belonging to the prior calendar day. Mirrors lib/dates.ts:
 * getActiveDateString() but in an arbitrary timezone instead of the server's
 * local one (Workers run in UTC).
 */
function activeDateIn(tz: string, now: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) if (p.type !== 'literal') parts[p.type] = p.value;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // Intl midnight quirk
  if (hour >= 6) return `${parts.year}-${parts.month}-${parts.day}`;
  // Before 6 AM — roll back one calendar day in the user's tz. Easiest path:
  // subtract 24h from `now`, then re-format as the date in the same tz.
  const prior = new Date(now.getTime() - 86400_000);
  const fmt2 = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p2: Record<string, string> = {};
  for (const p of fmt2.formatToParts(prior)) if (p.type !== 'literal') p2[p.type] = p.value;
  return `${p2.year}-${p2.month}-${p2.day}`;
}

export async function POST(req: NextRequest) {
  const expected = process.env.HEALTH_IMPORT_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'HEALTH_IMPORT_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { date?: string; steps?: number; sleep_minutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD if provided' }, { status: 400 });
  }
  if (typeof body.steps !== 'number' && typeof body.sleep_minutes !== 'number') {
    return NextResponse.json({ error: 'at least one of steps / sleep_minutes required' }, { status: 400 });
  }

  // Resolve the date: prefer the explicit one (used for backfills); otherwise
  // derive the active date in the user's tz with the 6 AM boundary applied.
  let date = body.date;
  if (!date) {
    const { data: prefs } = await supabaseServer()
      .from('notification_prefs').select('timezone').eq('id', 1).maybeSingle();
    const tz = (prefs as { timezone?: string } | null)?.timezone ?? 'America/Chicago';
    date = activeDateIn(tz, new Date());
  }

  // Patch only the fields we received so the row's other half (e.g. yesterday's
  // sleep posted at 7am) isn't clobbered by a later steps-only post.
  const patch: Record<string, unknown> = { date, posted_at: new Date().toISOString() };
  if (typeof body.steps === 'number' && body.steps >= 0) patch.steps = Math.round(body.steps);
  if (typeof body.sleep_minutes === 'number' && body.sleep_minutes >= 0) patch.sleep_minutes = Math.round(body.sleep_minutes);

  const { error } = await supabaseServer()
    .from('health_metrics')
    .upsert(patch, { onConflict: 'date' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
