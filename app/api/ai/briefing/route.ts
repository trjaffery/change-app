import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
function timeBucket(d: Date): 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
  const h = d.getHours();
  if (h >= 6 && h < 12) return 'Morning';
  if (h >= 12 && h < 18) return 'Afternoon';
  if (h >= 18 && h < 22) return 'Evening';
  return 'Night';
}

export const maxDuration = 25;

interface BriefingResponse { line: string; skip?: false }
interface SkipResponse { skip: true }

/**
 * One-line daily briefing. Only speaks when there's a *specific* signal in
 * today's data that a coaching nudge can act on. Default is to skip silently —
 * a daily motivational paragraph the user has learned to ignore is worse than
 * an empty card.
 */
export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const sb = supabaseServer();
    const now = new Date();
    const today = toDateStr(now);
    const todayDow = now.getDay();
    const todayDom = now.getDate();
    const todayLabel = now.toLocaleDateString('en-US', { weekday: 'long' });

    const sevenAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

    const [habitsRes, todayCompRes, splitsRes, settingsRes, urgesRes, goalsRes, relapsesRes] = await Promise.all([
      sb.from('habits').select('id, name, goal_value, schedule_type, schedule_days').is('archived_at', null),
      sb.from('habit_completions').select('habit_id, count').eq('date', today),
      sb.from('splits').select('name, split_days(name, day_of_week, split_exercises(exercise))').eq('is_active', true).limit(1),
      sb.from('recovery_settings').select('key, value'),
      sb.from('recovery_urges').select('intensity, created_at').order('created_at', { ascending: false }),
      sb.from('goals').select('text, done').eq('date', today),
      sb.from('recovery_relapses').select('created_at').gte('created_at', sevenAgoIso).order('created_at', { ascending: false }),
    ]);

    // ── Hot windows for today's day-of-week (from all-time urge log) ─────
    const urges = (urgesRes.data ?? []) as Array<{ intensity: number; created_at: string }>;
    const todayBuckets: Record<string, number> = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    for (const u of urges) {
      const d = new Date(u.created_at);
      if (d.getDay() === todayDow) todayBuckets[timeBucket(d)]++;
    }
    const peakWindow = Object.entries(todayBuckets).sort((a, b) => b[1] - a[1])[0];
    const todayHasHotWindow = peakWindow && peakWindow[1] >= 3;

    // ── Habits for today ───────────────────────────────────────────────
    const allHabits = habitsRes.data ?? [];
    const todayHabits = allHabits.filter(h => {
      if (h.schedule_type === 'specific_days_week') return h.schedule_days?.includes(todayDow);
      if (h.schedule_type === 'specific_days_month') return h.schedule_days?.includes(todayDom);
      return true;
    });
    const todayComp: Record<string, number> = {};
    for (const c of todayCompRes.data ?? []) todayComp[c.habit_id] = c.count;
    const habitsDoneToday = todayHabits.filter(h => (todayComp[h.id] ?? 0) >= h.goal_value).length;

    // ── Today's workout ─────────────────────────────────────────────────
    const activeSplit = splitsRes.data?.[0];
    type SplitDay = { name: string; day_of_week: number[] | null; split_exercises: { exercise: string }[] | null };
    const todaySplitDay = activeSplit ? (activeSplit.split_days as SplitDay[]).find(d => d.day_of_week?.includes(todayDow)) : undefined;

    // ── Streak / relapse ────────────────────────────────────────────────
    const settings: Record<string, string> = {};
    for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
    const sobrietyStart = settings['sobriety_start'];
    const streakDays = sobrietyStart ? Math.floor((Date.now() - new Date(sobrietyStart).getTime()) / 86400000) : null;
    const lastRelapse = relapsesRes.data?.[0];
    const daysSinceRelapse = lastRelapse ? Math.floor((Date.now() - new Date(lastRelapse.created_at).getTime()) / 86400000) : null;

    // ── Goals ───────────────────────────────────────────────────────────
    const goals = goalsRes.data ?? [];
    const pendingGoals = goals.filter(g => !g.done).length;

    // ── Skip-vs-speak decision ─────────────────────────────────────────
    // We need at least ONE actionable signal to bother speaking.
    const signals: string[] = [];
    if (todayHasHotWindow) signals.push(`hot_window:${peakWindow![0]}:${peakWindow![1]}`);
    if (todaySplitDay) signals.push(`workout:${todaySplitDay.name}`);
    if (daysSinceRelapse !== null && daysSinceRelapse <= 2) signals.push(`recent_relapse:${daysSinceRelapse}d`);
    if (streakDays !== null && (streakDays === 7 || streakDays === 14 || streakDays === 30 || streakDays === 60 || streakDays === 100 || streakDays % 100 === 0)) {
      signals.push(`streak_milestone:${streakDays}`);
    }

    if (signals.length === 0) {
      return NextResponse.json({ skip: true } satisfies SkipResponse);
    }

    // ── Build a tight prompt — feed only the signal-relevant facts ───
    const ctx: string[] = [`Today is ${todayLabel}.`];
    if (todayHasHotWindow) {
      ctx.push(`Historical urge data shows ${todayLabel}s tend to peak in the ${peakWindow![0].toLowerCase()} (${peakWindow![1]} urges logged on past ${todayLabel}s).`);
    }
    if (todaySplitDay) {
      const lifts = todaySplitDay.split_exercises?.slice(0, 4).map(e => e.exercise).join(', ');
      ctx.push(`Scheduled workout today: ${todaySplitDay.name}${lifts ? ` — ${lifts}` : ''}.`);
    }
    if (daysSinceRelapse !== null && daysSinceRelapse <= 2) {
      ctx.push(`A relapse was logged ${daysSinceRelapse === 0 ? 'today' : `${daysSinceRelapse} day${daysSinceRelapse === 1 ? '' : 's'} ago`}.`);
    }
    if (streakDays !== null) {
      ctx.push(`Recovery streak: day ${streakDays}.`);
    }
    if (todayHabits.length) ctx.push(`${habitsDoneToday}/${todayHabits.length} habits done so far today.`);
    if (pendingGoals) ctx.push(`${pendingGoals} pending goal${pendingGoals === 1 ? '' : 's'} on today's list.`);

    const prompt = ctx.join('\n') + `

Write ONE sentence (≤25 words) that names a specific thing the user can do today, grounded in the data above. If the only signal is a streak milestone, you may acknowledge it briefly. Output compact JSON: {"line":"…"}`;

    const raw = await callAI(prompt, 'You are a coach writing a one-line setup for today. Be specific, not motivational. Cite the actual signal (day, peak window, workout, streak day). No platitudes. Output compact JSON only.', 200);
    const parsed = parseJSON<BriefingResponse>(raw);
    if (!parsed.line || parsed.line.trim().length < 6) return NextResponse.json({ skip: true } satisfies SkipResponse);
    return NextResponse.json({ line: parsed.line.trim() } satisfies BriefingResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[briefing] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
