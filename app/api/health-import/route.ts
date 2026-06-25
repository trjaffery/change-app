import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * GET /api/health-import?days=N → last N days of steps + sleep, ascending.
 * Cookie-auth via middleware (the Shortcut writes via /webhook, the in-app
 * card reads from here).
 */
export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const days = Math.max(7, Math.min(90, Number(req.nextUrl.searchParams.get('days') ?? 30)));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const { data, error } = await sb
    .from('health_metrics')
    .select('date, steps, sleep_minutes')
    .gte('date', sinceStr)
    .order('date', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
