import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const start = req.nextUrl.searchParams.get('start');
  const end = req.nextUrl.searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  const { data: habits, error } = await sb
    .from('habits')
    .select('id, name, color, goal_value, goal_period')
    .is('archived_at', null)
    .order('position', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: completions } = await sb
    .from('habit_completions')
    .select('habit_id, date, count')
    .gte('date', start)
    .lte('date', end);

  const completionMap: Record<string, Record<string, number>> = {};
  for (const c of completions ?? []) {
    if (!completionMap[c.habit_id]) completionMap[c.habit_id] = {};
    completionMap[c.habit_id][c.date] = c.count as number;
  }

  return NextResponse.json({ habits: habits ?? [], completions: completionMap });
}
