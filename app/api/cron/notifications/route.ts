import { NextRequest, NextResponse } from 'next/server';
import { runNotificationTick } from '@/lib/notifications';

/**
 * Cron endpoint — hit every 5 minutes by the companion cron worker
 * (cron-worker/src/index.js). Bearer-authenticated with CRON_SECRET so a
 * leaked URL can't be used to spam pushes.
 *
 * Returns the local-time snapshot so cron-worker logs surface tick info.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runNotificationTick();
    return NextResponse.json(result);
  } catch (e) {
    console.error('[cron/notifications] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Manual smoke test from the browser while logged in (middleware-gated):
// GET /api/cron/notifications?dry=1 — runs the tick using the request user's
// auth cookie, returns the dispatch summary.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('dry') !== '1') {
    return NextResponse.json({ error: 'Use POST with bearer auth, or ?dry=1 for a manual run.' }, { status: 405 });
  }
  try {
    const result = await runNotificationTick();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
