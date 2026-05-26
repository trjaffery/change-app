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

    const fourteenAgoIso = new Date(Date.now() - 14 * 86400000).toISOString();
    const sevenAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
    const [habitsRes, completionsRes, relapsesRes, urgesRes] = await Promise.all([
      sb.from('habits').select('id, name, goal_value, goal_period, schedule_type, schedule_days, schedule_count, created_at').is('archived_at', null),
      sb.from('habit_completions').select('habit_id, date, count').gte('date', thirtyAgo).lte('date', today),
      sb.from('recovery_relapses').select('created_at').gte('created_at', fourteenAgoIso),
      sb.from('recovery_urges').select('intensity, created_at').gte('created_at', sevenAgoIso),
    ]);

    const habits = habitsRes.data ?? [];
    if (!habits.length) return NextResponse.json({ insights: [], newHabitSuggestion: undefined });

    const compByHabit: Record<string, { date: string; count: number }[]> = {};
    for (const c of completionsRes.data ?? []) {
      if (!compByHabit[c.habit_id]) compByHabit[c.habit_id] = [];
      compByHabit[c.habit_id].push({ date: c.date, count: c.count });
    }

    // Compute how many days in the trackingDays window the habit was *expected* to be done
    function expectedDays(h: typeof habits[number], trackingDays: number): number {
      if (h.schedule_type === 'daily') return trackingDays;
      if (h.schedule_type === 'days_per_week') return Math.round((h.schedule_count ?? 0) * (trackingDays / 7));
      if (h.schedule_type === 'days_per_month') return Math.round((h.schedule_count ?? 0) * (trackingDays / 30));
      if (h.schedule_type === 'specific_days_week' && h.schedule_days?.length) {
        // count days in window whose day-of-week is in schedule_days
        let n = 0;
        for (let i = 0; i < trackingDays; i++) {
          const d = new Date(Date.now() - i * 86400000);
          if (h.schedule_days.includes(d.getDay())) n++;
        }
        return n;
      }
      if (h.schedule_type === 'specific_days_month' && h.schedule_days?.length) {
        let n = 0;
        for (let i = 0; i < trackingDays; i++) {
          const d = new Date(Date.now() - i * 86400000);
          if (h.schedule_days.includes(d.getDate())) n++;
        }
        return n;
      }
      return trackingDays;
    }

    const habitStats = habits.map(h => {
      const comps = compByHabit[h.id] ?? [];
      const daysLogged = comps.filter(c => c.count >= h.goal_value).length;
      // Only count days since the habit was created, capped at 30
      const createdAt = new Date(h.created_at);
      const daysSinceCreation = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 86400000));
      const trackingDays = Math.min(30, daysSinceCreation);
      const expected = Math.max(1, expectedDays(h, trackingDays));
      const completionRate = Math.round((daysLogged / expected) * 100);
      const streak = computeStreak30(comps, h.goal_value, today);
      return {
        name: h.name,
        goal_value: h.goal_value,
        goal_period: h.goal_period,
        schedule_type: h.schedule_type,
        schedule_count: h.schedule_count,
        completionRate,
        daysHit: daysLogged,
        expected,
        trackingDays,
        streak,
        isNew: trackingDays < 7,
      };
    });

    // Recovery life-context
    const relapses = relapsesRes.data ?? [];
    const urges = urgesRes.data ?? [];
    const avgUrgeIntensity = urges.length
      ? (urges.reduce((s, u) => s + u.intensity, 0) / urges.length).toFixed(1)
      : null;
    const recoveryContext = (relapses.length > 0 || urges.length > 2)
      ? `LIFE CONTEXT (may affect habit motivation):
- Relapses in last 14 days: ${relapses.length}
- Urges in last 7 days: ${urges.length}${avgUrgeIntensity ? ` (avg intensity ${avgUrgeIntensity}/5)` : ''}
`
      : '';

    const prompt = `${recoveryContext}Here are my habits with their actual tracking data (compared against their scheduled cadence, not raw daily):
${habitStats.map(h =>
  `- ${h.name}: hit ${h.daysHit}/${h.expected} expected days over last ${h.trackingDays}d (${h.completionRate}%), current streak ${h.streak}d, schedule: ${h.schedule_type}${h.schedule_count ? ` (${h.schedule_count}x)` : ''}, goal ${h.goal_value}x per ${h.goal_period}${h.isNew ? ` [HABIT IS ONLY ${h.trackingDays} DAY(S) OLD]` : ''}`
).join('\n')}

Analyse each habit and return a JSON object with this exact shape:
{"insights":[{"habitName":"...","status":"crushing"|"on_track"|"struggling"|"new","advice":"1 encouraging sentence"}],"newHabitSuggestion":"optional 1 sentence idea for a new habit"}

Rules:
- Compare hit days against EXPECTED days (based on schedule), not raw 30. "5 of 12 scheduled" reads very differently from "5 of 30".
- If a habit is marked [HABIT IS ONLY X DAY(S) OLD]: use status "new" and give an encouraging "great start" message — never suggest reducing the goal for a brand new habit
- For established habits: "crushing" if ≥ 80% of expected, "on_track" if 50–79%, "struggling" if < 50%
- If LIFE CONTEXT shows recent relapses or high urge counts, factor that into struggling-habit advice — be compassionate, don't push harder. A struggling habit during recovery setback is expected.
- Keep advice positive and specific to what the habit actually is`;

    const raw = await callAI(prompt, 'You are a supportive habit coach. Respond with compact JSON only — no markdown, no extra text. The user is Muslim. In the advice strings, where natural, you may briefly reference Islamic values like istiqama (steadfastness) or sabr. One subtle reference across all insights max — never preachy.', 1200);
    const result = parseJSON<CoachResponse>(raw);

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[habit-coach] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
