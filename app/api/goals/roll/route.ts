import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * POST /api/goals/roll
 *   body: { date: 'YYYY-MM-DD' }   // the target date
 *   Moves all undone goals with date < target → date = target.
 *
 *   Idempotent: subsequent calls are no-ops because nothing remains with date<target.
 *   Used on DailyGoals mount to surface yesterday's unfinished goals on today.
 */
export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { date } = await req.json();
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

  // Pull undone goals from before the target date.
  const { data: stale, error: selErr } = await sb
    .from('goals')
    .select('id, position')
    .lt('date', date)
    .eq('done', false);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!stale || stale.length === 0) return NextResponse.json({ rolled: 0 });

  // Roll them forward. Bulk update.
  const { error: updErr } = await sb
    .from('goals')
    .update({ date })
    .in('id', stale.map(g => g.id));
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ rolled: stale.length });
}
