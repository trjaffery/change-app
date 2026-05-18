import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

function getPeriodStart(date: string, period: string): string {
  if (period === 'day') return date;
  if (period === 'week') {
    const d = new Date(date + 'T12:00:00Z');
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().split('T')[0];
  }
  return date.slice(0, 7) + '-01';
}

function isHabitDueToday(habit: Record<string, unknown>, date: string): boolean {
  const d = new Date(date + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const dom = d.getUTCDate();
  const days = habit.schedule_days as number[] | null;
  switch (habit.schedule_type as string) {
    case 'specific_days_week': return days?.includes(dow) ?? false;
    case 'specific_days_month': return days?.includes(dom) ?? false;
    default: return true;
  }
}

function computeStreak(dates: string[], today: string): number {
  if (!dates.length) return 0;
  const s = new Set(dates);
  let streak = 0;
  const d = new Date(today + 'T12:00:00Z');
  if (!s.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (!s.has(ds)) break;
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0];

  const { data: habits, error } = await sb
    .from('habits')
    .select('*')
    .is('archived_at', null)
    .order('position', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!habits?.length) return NextResponse.json([]);

  const monthStart = date.slice(0, 7) + '-01';

  const { data: completions } = await sb
    .from('habit_completions')
    .select('habit_id, date, count')
    .gte('date', monthStart)
    .lte('date', date);

  const since = new Date(date + 'T12:00:00Z');
  since.setUTCDate(since.getUTCDate() - 400);
  const sinceStr = since.toISOString().split('T')[0];

  const { data: allCompletions } = await sb
    .from('habit_completions')
    .select('habit_id, date')
    .gte('date', sinceStr)
    .lte('date', date);

  const completionsByHabit = new Map<string, string[]>();
  for (const c of allCompletions ?? []) {
    if (!completionsByHabit.has(c.habit_id)) completionsByHabit.set(c.habit_id, []);
    completionsByHabit.get(c.habit_id)!.push(c.date);
  }

  const result = habits
    .filter(h => isHabitDueToday(h, date))
    .map(h => {
      const periodStart = getPeriodStart(date, h.goal_period as string);
      const periodDone = (completions ?? [])
        .filter(c => c.habit_id === h.id && c.date >= periodStart && c.date <= date)
        .reduce((sum, c) => sum + (c.count as number), 0);
      return {
        ...h,
        period_done: periodDone,
        is_complete: periodDone >= (h.goal_value as number),
        streak: computeStreak(completionsByHabit.get(h.id) ?? [], date),
      };
    });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { name, color, schedule_type, schedule_days, schedule_count, goal_period, goal_value } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data: last } = await sb
    .from('habits')
    .select('position')
    .order('position', { ascending: false })
    .limit(1);
  const position = (last?.[0]?.position ?? -1) + 1;

  const { data, error } = await sb
    .from('habits')
    .insert({
      name,
      color: color ?? '#6BE3A4',
      position,
      schedule_type: schedule_type ?? 'daily',
      schedule_days: schedule_days ?? null,
      schedule_count: schedule_count ?? null,
      goal_period: goal_period ?? 'day',
      goal_value: goal_value ?? 1,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
