import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI } from '@/lib/ai';
import { computeCorrelations } from '@/lib/correlations';

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

export const maxDuration = 25;

export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
  const sb = supabaseServer();
  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  const todayDow = new Date().getDay();

  const correlationsPromise = computeCorrelations(sb);

  const sevenAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const [habitsRes, todayCompRes, yesterdayCompRes, splitsRes, settingsRes, urgesRes, goalsRes, relapsesRes] = await Promise.all([
    sb.from('habits').select('id, name, goal_value, goal_period, schedule_type, schedule_days, schedule_count').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, count').eq('date', today),
    sb.from('habit_completions').select('habit_id, count').eq('date', yesterday),
    sb.from('splits').select('name, split_days(name, day_of_week, split_exercises(exercise, target_sets, target_reps))').eq('is_active', true).limit(1),
    sb.from('recovery_settings').select('key, value'),
    sb.from('recovery_urges').select('intensity, note, created_at').order('created_at', { ascending: false }).limit(3),
    sb.from('goals').select('text, done').eq('date', today),
    sb.from('recovery_relapses').select('created_at, note').gte('created_at', sevenAgoIso).order('created_at', { ascending: false }),
  ]);

  const allHabits = habitsRes.data ?? [];
  const todayComp: Record<string, number> = {};
  for (const c of todayCompRes.data ?? []) todayComp[c.habit_id] = c.count;
  const yesterdayComp: Record<string, number> = {};
  for (const c of yesterdayCompRes.data ?? []) yesterdayComp[c.habit_id] = c.count;

  // Filter to habits scheduled for today (daily, weekly-with-today, monthly-with-today, or count-based ones)
  const todayDom = new Date().getDate();
  const habits = allHabits.filter(h => {
    if (h.schedule_type === 'specific_days_week') return h.schedule_days?.includes(todayDow);
    if (h.schedule_type === 'specific_days_month') return h.schedule_days?.includes(todayDom);
    return true; // daily, days_per_week, days_per_month — always show
  });

  const habitsDoneToday = habits.filter(h => (todayComp[h.id] ?? 0) >= h.goal_value).length;
  const yesterdayDone = allHabits.filter(h => (yesterdayComp[h.id] ?? 0) >= h.goal_value).length;

  const settings: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
  const sobrietyStart = settings['sobriety_start'];
  const streakDays = sobrietyStart
    ? Math.floor((Date.now() - new Date(sobrietyStart).getTime()) / 86400000)
    : null;

  const activeSplit = splitsRes.data?.[0];
  type SplitDay = { name: string; day_of_week: number[] | null; split_exercises: { exercise: string; target_sets: number | null; target_reps: string | null }[] | null };
  const todaySplitDay = activeSplit
    ? (activeSplit.split_days as SplitDay[]).find(d => d.day_of_week?.includes(todayDow))
    : undefined;
  const todayWorkout = todaySplitDay?.name ?? null;
  const todayLifts = todaySplitDay?.split_exercises
    ?.slice(0, 6)
    .map(e => `${e.exercise}${e.target_sets ? ` ${e.target_sets}×${e.target_reps ?? '?'}` : ''}`)
    .join(', ') ?? '';

  const urges = urgesRes.data ?? [];
  const recentUrgeNote = urges[0]?.note ? `Most recent urge note: "${urges[0].note}"` : '';

  // Today's goals
  const goals = goalsRes.data ?? [];
  const goalsDone = goals.filter(g => g.done).length;
  const firstPending = goals.find(g => !g.done)?.text;

  // Recent relapse — most important signal if present
  const relapses = relapsesRes.data ?? [];
  const lastRelapse = relapses[0];
  const daysSinceRelapse = lastRelapse
    ? Math.floor((Date.now() - new Date(lastRelapse.created_at).getTime()) / 86400000)
    : null;

  const correlations = await correlationsPromise;
  const topCorrelation = correlations.find(c => c.confidence === 'high') ?? correlations[0];

  const context = [
    `Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    habits.length > 0 ? `Habits scheduled today: ${habitsDoneToday}/${habits.length} done so far; yesterday ${yesterdayDone}/${allHabits.length} completed` : 'No habits scheduled today',
    goals.length > 0 ? `Today's goals: ${goalsDone}/${goals.length} done${firstPending ? ` — next up: "${firstPending}"` : ''}` : 'No goals set for today',
    todayWorkout ? `Today's workout: ${todayWorkout} (${activeSplit!.name})${todayLifts ? ` — ${todayLifts}` : ''}` : activeSplit ? `No workout scheduled for today in ${activeSplit.name}` : 'No active workout split',
    streakDays !== null ? `Recovery streak: ${streakDays} days` : 'No recovery streak set',
    lastRelapse ? `Relapse logged ${daysSinceRelapse === 0 ? 'today' : `${daysSinceRelapse} day${daysSinceRelapse === 1 ? '' : 's'} ago`}${lastRelapse.note ? ` — "${lastRelapse.note}"` : ''}` : '',
    urges.length > 0 ? `Recent urges: ${urges.length} logged, avg intensity ${(urges.reduce((s, u) => s + u.intensity, 0) / urges.length).toFixed(1)}/5. ${recentUrgeNote}` : 'No recent urges logged',
    topCorrelation ? `Pattern in their last 30 days: ${topCorrelation.finding}` : '',
  ].filter(Boolean).join('\n');

  const briefing = await callAI(
    context,
    'You are a personal coach writing a morning briefing for your client. Use ONLY numbers shown in the data block — never state X/Y where X > Y, never invent figures. Be warm, specific, and motivating without being preachy. Write 3–4 sentences. Reference their actual numbers — pick one or two of: today\'s goals, scheduled habits, the workout/lifts, the streak, or relapse if applicable. If a "Pattern in their last 30 days" line is provided, you may weave it in to make today\'s intention concrete (e.g. nudge toward a workout if it links to fewer urges) — state it as an observed association, never as proven cause, and only if it fits naturally. End with one concrete intention for today. If a recent relapse is listed, gently acknowledge it and frame today as a fresh start without dwelling. The user is Muslim. Where it flows naturally, weave in a brief Islamic reference — alhamdulillah, in sha Allah, or sabr/istiqama. At most one reference, never forced.',
    300,
  );

  return NextResponse.json({ briefing });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[briefing] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
