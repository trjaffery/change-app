import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

interface HabitInsight { habitName: string; status: 'crushing' | 'on_track' | 'struggling'; advice: string }
interface CoachResponse { insights: HabitInsight[]; newHabitSuggestion?: string }

export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  const sb = supabaseServer();
  const today = toDateStr(new Date());
  const thirtyAgo = toDateStr(new Date(Date.now() - 30 * 86400000));

  const [habitsRes, completionsRes] = await Promise.all([
    sb.from('habits').select('id, name, goal_value, goal_period, schedule_type').is('archived_at', null),
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
    const totalDays = 30;
    const completionRate = Math.round((daysLogged / totalDays) * 100);
    return { name: h.name, goal_value: h.goal_value, goal_period: h.goal_period, completionRate, daysHit: daysLogged };
  });

  const prompt = `Here are my habits over the last 30 days:\n${habitStats.map(h => `- ${h.name}: hit goal ${h.daysHit}/30 days (${h.completionRate}%), goal is ${h.goal_value}x per ${h.goal_period}`).join('\n')}\n\nAnalyse each habit and return a JSON object with this exact shape:\n{"insights":[{"habitName":"...","status":"crushing"|"on_track"|"struggling","advice":"1 sentence of specific advice"}],"newHabitSuggestion":"optional 1 sentence idea for a new complementary habit"}\n\nUse "crushing" if completion ≥ 80%, "on_track" if 50–79%, "struggling" if < 50%. Be specific and direct.`;

  const raw = await callAI(prompt, 'You are a habit coach. Respond with compact JSON only — no markdown, no extra text.', 1000);
  const result = parseJSON<CoachResponse>(raw);

  return NextResponse.json(result);
}
