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

    const prompt = `${recoveryContext}Habit tracking data. Every number below is verified ground truth — cite exactly, never inflate, never state X/Y where X > Y, never invent stats not shown here.

${habitStats.map(h =>
  `- ${h.name}: hit ${h.daysHit}/${h.expected} expected days over last ${h.trackingDays}d (${h.completionRate}%), current streak ${h.streak}d, schedule: ${h.schedule_type}${h.schedule_count ? ` (${h.schedule_count}x)` : ''}, goal ${h.goal_value}x per ${h.goal_period}${h.isNew ? ` [HABIT IS ONLY ${h.trackingDays} DAY(S) OLD]` : ''}`
).join('\n')}

Return JSON exactly: {"insights":[{"habitName":"...","status":"crushing"|"on_track"|"struggling"|"new","advice":"..."}],"newHabitSuggestion":"..."}

Status rules:
- [HABIT IS ONLY X DAY(S) OLD] → status "new". Encourage the start — never suggest reducing the goal for a brand-new habit.
- Established habits: "crushing" if ≥ 80% of expected, "on_track" if 50–79%, "struggling" if < 50%. Compare against EXPECTED, not raw 30.

Advice rules (every habit's advice must follow these):
- MUST reference at least one specific number from that habit's data (the rate, the streak, the days hit, etc.).
- MUST propose ONE concrete action: a starter cue ("after Fajr"), a temporary smaller goal, a time-of-day anchor, or stacking against an existing strong habit. Vague encouragement is rejected.
- BANNED filler phrases (the advice will be rejected if it contains any): "great foundation", "spiritual anchor", "commendable", "keep nurturing", "small consistent steps", "wonderful work", "amazing job", "renewed focus", "let's focus on".
- For "struggling" habits with LIFE CONTEXT showing relapses/high urges: be compassionate, suggest a smaller temporary goal — don't push harder.
- 1-2 sentences max per advice.

newHabitSuggestion rules:
- Must address an OBSERVED gap in their data (e.g. "you logged 0 workouts → suggest a 10-minute walk after Maghrib") or stack on a strong existing habit (e.g. "you're crushing salah → suggest 2 minutes of dhikr after each prayer").
- Reject generic thematic ideas not tied to their specific data. If no clear gap exists, omit the field.`;

    const raw = await callAI(prompt, 'You are a habit coach. Hard rules enforced strictly: (1) Use ONLY numbers shown in the data block. Never state X/Y where X > Y, never invent figures. (2) Every advice must cite a specific number AND propose a concrete action — vague encouragement is rejected. (3) BANNED filler: "great foundation", "spiritual anchor", "commendable", "keep nurturing", "small consistent steps", "wonderful work", "amazing job", "renewed focus", "let\'s focus on". (4) newHabitSuggestion must address an observed data gap or stack on a strong existing habit — never a generic thematic idea; omit if no clear gap. Respond with compact JSON only — no markdown, no extra text. The user is Muslim; one subtle reference to istiqama or sabr across all insights is fine, never preachy.', 1200);
    const result = parseJSON<CoachResponse>(raw);

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[habit-coach] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
