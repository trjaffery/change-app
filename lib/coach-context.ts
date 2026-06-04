import type { SupabaseClient } from '@supabase/supabase-js';
import { computeCorrelations } from '@/lib/correlations';

// Builds a compact, structured "what the coach knows about the user right now"
// text block. Injected into the system prompt for every chat turn so the AI
// can ground answers in actual data instead of guessing.
//
// Keep this tight: the more we send, the more we pay per turn. Aim for the
// stuff a coach actually needs to give specific advice about today + the
// recent past.
export async function buildCoachContext(sb: SupabaseClient): Promise<string> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dow = today.toLocaleDateString('en-US', { weekday: 'long' });
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const sevenAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const correlationsPromise = computeCorrelations(sb);

  const [
    habitsRes, todayCompRes, weekCompRes,
    splitsRes, settingsRes, urgesRes, recentUrgeNotesRes,
    goalsTodayRes, goalsWeekRes,
    sessionsRes, relapsesRes, nwHistoryRes,
    diaryWeekRes,
  ] = await Promise.all([
    sb.from('habits').select('id, name, goal_value, goal_period, schedule_type, schedule_days').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, count').eq('date', todayStr),
    sb.from('habit_completions').select('habit_id, date, count').gte('date', sevenAgo).lte('date', todayStr),
    sb.from('splits').select('name, split_days(name, day_of_week, split_exercises(exercise, target_sets, target_reps))').eq('is_active', true).limit(1),
    sb.from('recovery_settings').select('key, value'),
    sb.from('recovery_urges').select('intensity, note, triggers, created_at').gte('created_at', sevenAgoIso).order('created_at', { ascending: false }),
    sb.from('recovery_urges').select('intensity, note, created_at').order('created_at', { ascending: false }).limit(5),
    sb.from('goals').select('text, done').eq('date', todayStr),
    sb.from('goals').select('date, text, done').gte('date', sevenAgo).lte('date', todayStr),
    sb.from('gym_sessions').select('date, duration_seconds, split_days(name)').gte('date', sevenAgo).lte('date', todayStr),
    sb.from('recovery_relapses').select('created_at, note').gte('created_at', sevenAgoIso).order('created_at', { ascending: false }),
    sb.from('finance_nw_history').select('total, snapshot_date').gte('snapshot_date', sevenAgo).lte('snapshot_date', todayStr).order('snapshot_date'),
    sb.from('diary_entries').select('date, body, mood').gte('date', sevenAgo).lte('date', todayStr).order('date', { ascending: false }),
  ]);

  const habits = habitsRes.data ?? [];
  const todayCompMap = new Map<string, number>();
  for (const c of (todayCompRes.data ?? [])) todayCompMap.set(c.habit_id, c.count as number);

  // Today's habit status — which are scheduled today, how many of those are met.
  const todayDow = today.getUTCDay();
  const todayDom = today.getUTCDate();
  function isDueToday(h: { schedule_type: string; schedule_days: number[] | null }): boolean {
    if (h.schedule_type === 'specific_days_week') return h.schedule_days?.includes(todayDow) ?? false;
    if (h.schedule_type === 'specific_days_month') return h.schedule_days?.includes(todayDom) ?? false;
    return true;
  }
  const todayHabitLines = habits
    .filter(h => isDueToday(h))
    .map(h => {
      const cnt = todayCompMap.get(h.id) ?? 0;
      const met = h.goal_period === 'day' && cnt >= h.goal_value;
      return `  - ${h.name}: ${cnt}/${h.goal_value} ${met ? '✓' : ''}`;
    });

  // 7-day per-habit hit rate (matches habit-coach + weekly-review's definition).
  const dailyCounts = new Map<string, Map<string, number>>();
  for (const c of (weekCompRes.data ?? [])) {
    const m = dailyCounts.get(c.habit_id) ?? new Map<string, number>();
    m.set(c.date, (m.get(c.date) ?? 0) + (c.count as number));
    dailyCounts.set(c.habit_id, m);
  }
  const weekHabitLines = habits.map(h => {
    const counts = [...(dailyCounts.get(h.id)?.values() ?? [])];
    if (h.goal_period === 'day') {
      const hit = counts.filter(n => n >= h.goal_value).length;
      return `  - ${h.name}: hit goal ${hit}/7 days (goal ${h.goal_value}× per day)`;
    }
    const total = counts.reduce((s, n) => s + n, 0);
    return `  - ${h.name}: ${total} this week (goal ${h.goal_value}× per ${h.goal_period})`;
  });

  // Settings + streak.
  const settings: Record<string, string> = {};
  for (const s of (settingsRes.data ?? [])) settings[s.key] = s.value;
  const streakDays = settings['sobriety_start']
    ? Math.floor((Date.now() - new Date(settings['sobriety_start']).getTime()) / 86400000)
    : null;

  // Today's workout.
  const activeSplit = splitsRes.data?.[0];
  type SplitDay = { name: string; day_of_week: number[] | null; split_exercises: { exercise: string; target_sets: number | null; target_reps: string | null }[] | null };
  const todaySplitDay = activeSplit
    ? (activeSplit.split_days as SplitDay[]).find(d => d.day_of_week?.includes(todayDow))
    : undefined;
  const workoutLine = todaySplitDay
    ? `Today's workout: ${todaySplitDay.name} (${activeSplit!.name})${todaySplitDay.split_exercises?.length
        ? ` — ${todaySplitDay.split_exercises.slice(0, 6).map(e => `${e.exercise}${e.target_sets ? ` ${e.target_sets}×${e.target_reps ?? '?'}` : ''}`).join(', ')}`
        : ''}`
    : (activeSplit ? `No workout scheduled for today in active split "${activeSplit.name}".` : 'No active workout split.');

  // Urges this week.
  const urges = urgesRes.data ?? [];
  const urgeCount = urges.length;
  const avgIntensity = urges.length ? (urges.reduce((s, u) => s + (u.intensity as number), 0) / urges.length).toFixed(1) : null;
  const urgesWeekLine = urges.length === 0
    ? 'No urges logged in the last 7 days.'
    : `${urgeCount} urges logged in the last 7 days, avg intensity ${avgIntensity}/5.`;

  // Trigger tag distribution.
  const triggerCounts: Record<string, number> = {};
  for (const u of urges) {
    for (const t of ((u as { triggers?: string[] }).triggers ?? [])) {
      triggerCounts[t] = (triggerCounts[t] ?? 0) + 1;
    }
  }
  const triggerLine = Object.keys(triggerCounts).length
    ? `Trigger tags this week: ${Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} (${c})`).join(', ')}.`
    : '';

  // Recent urge notes (verbatim, last 5 ever — not just this week).
  const recentUrgeNotes = (recentUrgeNotesRes.data ?? [])
    .filter(u => (u.note as string | null)?.trim())
    .slice(0, 5)
    .map(u => {
      const d = new Date(u.created_at as string).toISOString().split('T')[0];
      return `  - ${d} (intensity ${u.intensity}/5): "${u.note}"`;
    });

  // Relapses this week.
  const relapses = relapsesRes.data ?? [];
  const relapseLines = relapses.map(r => {
    const d = new Date(r.created_at as string).toISOString().split('T')[0];
    return `  - ${d}${r.note ? ` — "${r.note}"` : ''}`;
  });

  // Goals.
  const todayGoals = goalsTodayRes.data ?? [];
  const goalsTodayLines = todayGoals.length === 0
    ? '  (no goals set for today)'
    : todayGoals.map(g => `  - [${g.done ? '✓' : ' '}] ${g.text}`).join('\n');
  const weekGoals = goalsWeekRes.data ?? [];
  const goalsSetDays = new Set(weekGoals.map(g => g.date as string)).size;
  const goalsDone = weekGoals.filter(g => g.done).length;
  const goalsWeekLine = weekGoals.length === 0
    ? 'No daily goals set in the last 7 days.'
    : `Last 7 days: goals set on ${goalsSetDays}/7 days, ${goalsDone}/${weekGoals.length} completed.`;

  // Gym 7-day rollup.
  const sessions = sessionsRes.data ?? [];
  const workoutCount = sessions.length;
  const totalMin = Math.round(sessions.reduce((s, sess) => s + ((sess.duration_seconds ?? 0) as number), 0) / 60);
  const gymWeekLine = workoutCount === 0
    ? 'No workouts logged in the last 7 days.'
    : `${workoutCount} workouts, ${totalMin} minutes total in the last 7 days.`;

  // Net worth change.
  const nw = nwHistoryRes.data ?? [];
  const nwChange = nw.length >= 2 ? (nw[nw.length - 1].total as number) - (nw[0].total as number) : null;
  const nwLine = nwChange === null
    ? 'No net worth snapshots in the last 7 days.'
    : `Net worth this week: ${nwChange >= 0 ? '+' : '−'}$${Math.abs(Math.round(nwChange)).toLocaleString()} change.`;

  // Last 7 days of diary entries — verbatim, newest first. The coach can use
  // these for sentiment/context (how the user actually felt) on top of the
  // numbers. Mood is 1-5 (1=rough, 5=great).
  const diaryWeek = (diaryWeekRes.data ?? []).filter(d => (d.body as string)?.trim());
  const diaryLines = diaryWeek.length === 0
    ? '  (no diary entries in the last 7 days)'
    : diaryWeek.map(d => {
        const moodStr = d.mood ? ` [mood ${d.mood}/5]` : '';
        // Indent body so it visually nests under the date header
        const indented = (d.body as string).trim().split('\n').map(l => `    ${l}`).join('\n');
        return `  ${d.date}${moodStr}\n${indented}`;
      }).join('\n\n');

  // 30-day patterns.
  const correlations = await correlationsPromise;
  const patternLines = correlations.length === 0
    ? '  (no significant patterns detected — data may be too sparse)'
    : correlations.map(c => `  - [${c.strength}, ${c.samples.a} vs ${c.samples.b} days${c.confidence === 'low' ? ', rough estimate' : ''}] ${c.finding}`).join('\n');

  return [
    `=== USER DATA SNAPSHOT (every number here is verified ground truth; cite exactly, never invent) ===`,
    ``,
    `Today: ${todayStr} (${dow})`,
    ``,
    `[TODAY'S SCHEDULED HABITS]`,
    todayHabitLines.length ? todayHabitLines.join('\n') : '  (no habits scheduled today)',
    ``,
    `[TODAY'S GOALS]`,
    goalsTodayLines,
    ``,
    `[TODAY'S WORKOUT]`,
    `${workoutLine}`,
    ``,
    `[RECOVERY]`,
    streakDays !== null ? `Sobriety streak: ${streakDays} days.` : 'No sobriety_start configured.',
    urgesWeekLine,
    triggerLine,
    relapses.length === 0 ? 'No relapses in the last 7 days.' : `Relapses this week (${relapses.length}):\n${relapseLines.join('\n')}`,
    ``,
    `[LAST 7 DAYS — HABIT HIT RATES]`,
    weekHabitLines.length ? weekHabitLines.join('\n') : '  (no habits tracked)',
    ``,
    `[LAST 7 DAYS — GOALS]`,
    `  ${goalsWeekLine}`,
    ``,
    `[LAST 7 DAYS — GYM]`,
    `  ${gymWeekLine}`,
    ``,
    `[LAST 7 DAYS — FINANCE]`,
    `  ${nwLine}`,
    ``,
    `[30-DAY CROSS-DOMAIN PATTERNS]`,
    patternLines,
    ``,
    `[DIARY — LAST 7 DAYS, NEWEST FIRST]`,
    diaryLines,
    ``,
    recentUrgeNotes.length ? `[RECENT URGE NOTES — most recent first]\n${recentUrgeNotes.join('\n')}\n` : '',
    `=== END SNAPSHOT ===`,
  ].filter(Boolean).join('\n');
}
