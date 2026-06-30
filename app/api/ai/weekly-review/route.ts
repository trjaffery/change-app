import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

// Sunday-anchored week start. If today is Sunday, today is the week start.
function weekStartSunday(d: Date = new Date()): string {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // back up to Sunday
  return toDateStr(x);
}

interface ReviewResponse { summary: string; wins: string[]; improvements: string[]; plan: string[] }

interface WindowStats {
  workouts: number;
  workout_minutes: number;
  urges: number;
  avg_intensity: number | null;
  relapses: number;
  habit_hit_rate: number | null; // 0..1, hit_days / scheduled_days across all habits
  tasks_set_days: number;
  tasks_done: number;
  tasks_total: number;
}

async function fetchWindowStats(sb: ReturnType<typeof supabaseServer>, weekStart: string): Promise<WindowStats> {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start.getTime() + 7 * 86400000 - 1);
  const startStr = toDateStr(start);
  const endStr = toDateStr(end);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [habitsRes, compsRes, sessionsRes, urgesRes, relapsesRes, tasksRes] = await Promise.all([
    sb.from('habits').select('id, goal_value, schedule_type, schedule_days, schedule_count, created_at').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, date, count').gte('date', startStr).lte('date', endStr),
    sb.from('gym_sessions').select('date, duration_seconds').gte('date', startStr).lte('date', endStr),
    sb.from('recovery_urges').select('intensity').gte('created_at', startIso).lte('created_at', endIso),
    sb.from('recovery_relapses').select('created_at').gte('created_at', startIso).lte('created_at', endIso),
    sb.from('tasks').select('due_date, done').gte('due_date', startStr).lte('due_date', endStr),
  ]);

  const habits = habitsRes.data ?? [];
  const comps = compsRes.data ?? [];
  const compByHabit: Record<string, Map<string, number>> = {};
  for (const c of comps) {
    (compByHabit[c.habit_id] ?? (compByHabit[c.habit_id] = new Map())).set(c.date, c.count);
  }
  let hitTotal = 0, scheduledTotal = 0;
  for (const h of habits) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const ds = toDateStr(d);
      // skip days before habit existed
      if (new Date(h.created_at).getTime() > d.getTime() + 86400000) continue;
      let scheduled = false;
      if (h.schedule_type === 'daily') scheduled = true;
      else if (h.schedule_type === 'specific_days_week') scheduled = !!h.schedule_days?.includes(d.getDay());
      else if (h.schedule_type === 'specific_days_month') scheduled = !!h.schedule_days?.includes(d.getDate());
      else scheduled = true; // days_per_week/days_per_month — count every day, will average out
      if (!scheduled) continue;
      scheduledTotal++;
      if ((compByHabit[h.id]?.get(ds) ?? 0) >= h.goal_value) hitTotal++;
    }
  }

  const sessions = sessionsRes.data ?? [];
  const urges = urgesRes.data ?? [];
  const relapses = relapsesRes.data ?? [];
  const tasks = (tasksRes.data ?? []) as Array<{ due_date: string | null; done: boolean }>;

  const taskDates = new Set(tasks.map(t => t.due_date).filter((d): d is string => !!d));
  return {
    workouts: sessions.length,
    workout_minutes: Math.round(sessions.reduce((s, x) => s + (x.duration_seconds ?? 0), 0) / 60),
    urges: urges.length,
    avg_intensity: urges.length ? urges.reduce((s, u) => s + u.intensity, 0) / urges.length : null,
    relapses: relapses.length,
    habit_hit_rate: scheduledTotal > 0 ? hitTotal / scheduledTotal : null,
    tasks_set_days: taskDates.size,
    tasks_done: tasks.filter(t => t.done).length,
    tasks_total: tasks.length,
  };
}

/**
 * GET ?week_start=YYYY-MM-DD — return the cached review for a week, or
 * { review: null } if not yet generated. Defaults to current week.
 */
export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get('week_start') ?? weekStartSunday();
  const { data, error } = await sb.from('weekly_review_cache').select('week_start, generated_at, review').eq('week_start', weekStart).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ week_start: weekStart, review: data?.review ?? null, generated_at: data?.generated_at ?? null });
}

/**
 * POST { week_start? } — regenerate and upsert. Defaults to current week.
 * New focus: what changed vs the prior 7 days + one prescriptive action.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const sb = supabaseServer();
    let weekStart: string;
    try {
      const body = await req.json().catch(() => ({})) as { week_start?: string };
      weekStart = body.week_start ?? weekStartSunday();
    } catch { weekStart = weekStartSunday(); }
    const priorWeekStart = toDateStr(new Date(new Date(weekStart + 'T00:00:00').getTime() - 7 * 86400000));

    const [thisWeek, priorWeek] = await Promise.all([
      fetchWindowStats(sb, weekStart),
      fetchWindowStats(sb, priorWeekStart),
    ]);

    function fmt(x: number | null): string { return x === null ? '—' : x.toFixed(1); }
    function pct(x: number | null): string { return x === null ? '—' : `${Math.round(x * 100)}%`; }

    const prompt = `Weekly review. Compare THIS WEEK vs PRIOR WEEK. Cite the exact numbers below; never invent stats.

THIS WEEK (${weekStart}):
- Habits: hit rate ${pct(thisWeek.habit_hit_rate)}
- Workouts: ${thisWeek.workouts} (${thisWeek.workout_minutes} min total)
- Urges: ${thisWeek.urges}${thisWeek.avg_intensity !== null ? ` (avg ${fmt(thisWeek.avg_intensity)}/5)` : ''}
- Relapses: ${thisWeek.relapses}
- Tasks: scheduled on ${thisWeek.tasks_set_days}/7 days, ${thisWeek.tasks_done}/${thisWeek.tasks_total} done

PRIOR WEEK (${priorWeekStart}):
- Habits: hit rate ${pct(priorWeek.habit_hit_rate)}
- Workouts: ${priorWeek.workouts} (${priorWeek.workout_minutes} min total)
- Urges: ${priorWeek.urges}${priorWeek.avg_intensity !== null ? ` (avg ${fmt(priorWeek.avg_intensity)}/5)` : ''}
- Relapses: ${priorWeek.relapses}
- Tasks: scheduled on ${priorWeek.tasks_set_days}/7 days, ${priorWeek.tasks_done}/${priorWeek.tasks_total} done

Return JSON exactly:
{"summary":"1–2 sentence summary that names the BIGGEST change this week vs prior. Cite numbers.","wins":["≤3 specific wins"],"improvements":["≤3 specific improvements"],"plan":["EXACTLY ONE prescriptive action item for next week — the single most important next move"]}

Rules:
- Every win/improvement/plan must cite at least one specific number from the data block.
- Summary names the biggest *delta* (e.g. "Urges dropped from 12 to 4; workouts held steady at 3.")
- If a relapse occurred, summary acknowledges it once with compassion, then surfaces the resilience numbers.
- Plan is EXACTLY ONE item. Pick the single highest-leverage move based on the deltas.
- BANNED filler: "great foundation", "small consistent steps", "amazing job", "keep going", "renewed focus".
- Compact JSON only.`;

    const raw = await callAI(prompt, 'You write a tight weekly review focused on week-over-week deltas. Cite numbers verbatim. One prescriptive plan item — pick the highest-leverage move. Output compact JSON only.', 900);
    const review = parseJSON<ReviewResponse>(raw);

    await sb.from('weekly_review_cache').upsert({ week_start: weekStart, generated_at: new Date().toISOString(), review });
    return NextResponse.json(review);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[weekly-review] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
