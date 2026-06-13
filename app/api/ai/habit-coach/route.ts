import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';
import { computeHabitStatus, type HabitStatusResult } from '@/lib/habits-status';

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

interface AdvicePayload { habitId: string; advice: string }
interface CoachPostResponse { insights: AdvicePayload[]; newHabitSuggestion?: string | null }

/**
 * GET — deterministic per-habit status from the last 14 days of completions.
 * No AI call. The component renders these immediately on mount.
 *
 * POST { struggling: HabitStatusResult[] } — generates one advice line per
 * struggling habit + an optional new-habit suggestion. Only this path costs
 * tokens. If `struggling` is empty, we skip the AI call entirely.
 */
export async function GET() {
  try {
    const sb = supabaseServer();
    const today = toDateStr(new Date());
    const fourteenAgo = toDateStr(new Date(Date.now() - 14 * 86400000));

    const [habitsRes, completionsRes] = await Promise.all([
      sb.from('habits').select('id, name, goal_value, goal_period, schedule_type, schedule_days, schedule_count, created_at').is('archived_at', null),
      sb.from('habit_completions').select('habit_id, date, count').gte('date', fourteenAgo).lte('date', today),
    ]);
    const habits = habitsRes.data ?? [];
    const compByHabit: Record<string, { date: string; count: number }[]> = {};
    for (const c of completionsRes.data ?? []) {
      (compByHabit[c.habit_id] ?? (compByHabit[c.habit_id] = [])).push({ date: c.date, count: c.count });
    }
    const statuses = habits.map(h => computeHabitStatus(h, compByHabit[h.id] ?? []));
    const struggling_count = statuses.filter(s => s.status === 'struggling').length;
    return NextResponse.json({ statuses, struggling_count });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[habit-coach GET] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const body = await req.json() as { struggling: HabitStatusResult[]; total_habits: number };
    const { struggling, total_habits } = body;

    // No struggling habits → no AI call. Empty insights, possibly a new-habit
    // suggestion if the user has very few habits.
    if (!Array.isArray(struggling) || struggling.length === 0) {
      return NextResponse.json({ insights: [], newHabitSuggestion: null } satisfies CoachPostResponse);
    }

    // Optional life-context to soften advice when recovery is rough.
    const sb = supabaseServer();
    const sevenAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
    const fourteenAgoIso = new Date(Date.now() - 14 * 86400000).toISOString();
    const [urgesRes, relapsesRes] = await Promise.all([
      sb.from('recovery_urges').select('intensity, created_at').gte('created_at', sevenAgoIso),
      sb.from('recovery_relapses').select('created_at').gte('created_at', fourteenAgoIso),
    ]);
    const urges = urgesRes.data ?? [];
    const relapses = relapsesRes.data ?? [];
    const recoveryRough = relapses.length > 0 || urges.length >= 4;

    const lines = struggling.map(s => (
      `- id=${s.habitId} "${s.name}": ${s.days_hit}/${s.expected_days} days (${s.completion_rate}% of target), streak ${s.current_streak}d, schedule ${s.schedule_type}${s.schedule_count ? `(${s.schedule_count}x)` : ''}, goal ${s.goal_value}x/${s.goal_period}`
    )).join('\n');

    const wantsSuggestion = (total_habits ?? 0) < 5;

    const prompt = `${recoveryRough ? `LIFE CONTEXT: recovery rough — ${relapses.length} relapse(s) in last 14d, ${urges.length} urges in last 7d. Be compassionate on struggling habits, suggest a temporarily smaller goal rather than pushing harder.\n\n` : ''}STRUGGLING HABITS:
${lines}

Return JSON exactly:
{"insights":[{"habitId":"<id from above>","advice":"<1 sentence, ≤25 words>"}]${wantsSuggestion ? ',"newHabitSuggestion":"<one new habit idea ≤20 words, or null>"' : ',"newHabitSuggestion":null'}}

Advice rules:
- Cite at least one specific number from the habit's line (rate, days hit, streak).
- Propose ONE concrete next move: a time-of-day anchor, a temporarily smaller goal, habit-stacking, or removing friction. No vague encouragement.
- 1 sentence per advice. Hard cap 25 words.
- BANNED filler: "great foundation", "small consistent steps", "amazing job", "keep going", "you got this", "renewed focus".`;

    const raw = await callAI(prompt, 'You write one advice line per struggling habit. Cite numbers, propose one concrete move, no platitudes. Output compact JSON only.', 800);
    const result = parseJSON<CoachPostResponse>(raw);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[habit-coach POST] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
