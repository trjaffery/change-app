import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function computeStreak30(comps: { date: string; count: number }[], goalValue: number, today: string): number {
  const hit = new Set(comps.filter(c => c.count >= goalValue).map(c => c.date));
  let streak = 0;
  const d = new Date(today + 'T00:00:00');
  if (!hit.has(today)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 30; i++) {
    const ds = d.toISOString().split('T')[0];
    if (!hit.has(ds)) break;
    streak++; d.setDate(d.getDate() - 1);
  }
  return streak;
}

interface HabitInsight { habitName: string; status: 'crushing' | 'on_track' | 'struggling' | 'new'; advice: string }
interface CoachResponse { insights: HabitInsight[]; newHabitSuggestion?: string }

export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const sb = supabaseServer();
    const today = toDateStr(new Date());
    const thirtyAgo = toDateStr(new Date(Date.now() - 30 * 86400000));

    const [habitsRes, completionsRes] = await Promise.all([
      sb.from('habits').select('id, name, goal_value, goal_period, schedule_type, created_at').is('archived_at', null),
      sb.from('habit_completions').select('habit_id, date, count').gte('date', thirtyAgo).lte('date', today),
    ]);

    const habits = habitsRes.data ?? [];
    if (!habits.length) return NextResponse.json({ insights: [], newHabitSuggestion: undefined });

    const compByHabit: Record<string, { date: string; count: number }[]> = {};
    for (const c of completionsRes.data ?? []) {
      if (!compByHabit[c.habit_id]) compByHabit[c.habit_id] = [];
      compByHabit[c.habit_id].push({ date: c.date, count: c.count });
    }

    const habitStats = habits.map(h => {
      const comps = compByHabit[h.id] ?? [];
      const daysLogged = comps.filter(c => c.count >= h.goal_value).length;
      // Only count days since the habit was created, capped at 30
      const createdAt = new Date(h.created_at);
      const daysSinceCreation = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 86400000));
      const trackingDays = Math.min(30, daysSinceCreation);
      const completionRate = Math.round((daysLogged / trackingDays) * 100);
      const streak = computeStreak30(comps, h.goal_value, today);
      return {
        name: h.name,
        goal_value: h.goal_value,
        goal_period: h.goal_period,
        completionRate,
        daysHit: daysLogged,
        trackingDays,
        streak,
        isNew: trackingDays < 7,
      };
    });

    const prompt = `Here are my habits with their actual tracking data:
${habitStats.map(h =>
  `- ${h.name}: hit goal ${h.daysHit}/${h.trackingDays} days (${h.completionRate}%), current streak: ${h.streak} days, goal is ${h.goal_value}x per ${h.goal_period}${h.isNew ? ` [HABIT IS ONLY ${h.trackingDays} DAY(S) OLD]` : ''}`
).join('\n')}

Analyse each habit and return a JSON object with this exact shape:
{"insights":[{"habitName":"...","status":"crushing"|"on_track"|"struggling"|"new","advice":"1 encouraging sentence"}],"newHabitSuggestion":"optional 1 sentence idea for a new habit"}

Rules:
- If a habit is marked [HABIT IS ONLY X DAY(S) OLD]: use status "new" and give an encouraging "great start" message — never suggest reducing the goal for a brand new habit
- For established habits (7+ days): "crushing" if ≥ 80%, "on_track" if 50–79%, "struggling" if < 50%
- Keep advice positive and specific to what the habit actually is`;

    const raw = await callAI(prompt, 'You are a supportive habit coach. Respond with compact JSON only — no markdown, no extra text. The user is Muslim. In the advice strings, where natural, you may briefly reference Islamic values like istiqama (steadfastness) or sabr. One subtle reference across all insights max — never preachy.', 1000);
    const result = parseJSON<CoachResponse>(raw);

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[habit-coach] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
