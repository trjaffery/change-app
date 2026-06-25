import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Webhook for the iOS Shortcut that uploads steps + sleep from HealthKit.
 *
 * Bearer-auth with HEALTH_IMPORT_SECRET — iOS Shortcuts can't carry cookies,
 * and this path is exempt from the app_token middleware so the Shortcut can
 * hit it with just the header.
 *
 * Body: { date: 'YYYY-MM-DD', steps?: number, sleep_minutes?: number }
 * Either metric is optional so the morning Shortcut can post just sleep and
 * the evening one can post just steps against the same row.
 */
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

  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: 'date YYYY-MM-DD required' }, { status: 400 });
  }
  if (typeof body.steps !== 'number' && typeof body.sleep_minutes !== 'number') {
    return NextResponse.json({ error: 'at least one of steps / sleep_minutes required' }, { status: 400 });
  }

  // Patch only the fields we received so the row's other half (e.g. yesterday's
  // sleep posted at 7am) isn't clobbered by a later steps-only post.
  const patch: Record<string, unknown> = { date: body.date, posted_at: new Date().toISOString() };
  if (typeof body.steps === 'number' && body.steps >= 0) patch.steps = Math.round(body.steps);
  if (typeof body.sleep_minutes === 'number' && body.sleep_minutes >= 0) patch.sleep_minutes = Math.round(body.sleep_minutes);

  const { error } = await supabaseServer()
    .from('health_metrics')
    .upsert(patch, { onConflict: 'date' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
