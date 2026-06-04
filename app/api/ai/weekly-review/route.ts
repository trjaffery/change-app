import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';
import { computeCorrelations } from '@/lib/correlations';

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

interface ReviewResponse { summary: string; wins: string[]; improvements: string[]; plan: string[] }

export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
  const sb = supabaseServer();
  const correlationsPromise = computeCorrelations(sb);
  const today = toDateStr(new Date());
  const sevenAgo = toDateStr(new Date(Date.now() - 7 * 86400000));

  const sevenAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const [habitsRes, completionsRes, sessionsRes, setsRes, urgesRes, settingsRes, nwHistoryRes, subsRes, relapsesRes, goalsRes, diaryRes] = await Promise.all([
    sb.from('habits').select('id, name, goal_value, goal_period').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, date, count').gte('date', sevenAgo).lte('date', today),
    sb.from('gym_sessions').select('date, duration_seconds, split_days(name)').gte('date', sevenAgo).lte('date', today),
    sb.from('gym_sets').select('date, exercise, reps, weight').gte('date', sevenAgo).lte('date', today),
    sb.from('recovery_urges').select('intensity, created_at').gte('created_at', sevenAgoIso),
    sb.from('recovery_settings').select('key, value'),
    sb.from('finance_nw_history').select('total, snapshot_date').gte('snapshot_date', sevenAgo).lte('snapshot_date', today).order('snapshot_date'),
    sb.from('finance_subscriptions').select('amount, billing_cycle'),
    sb.from('recovery_relapses').select('created_at, note').gte('created_at', sevenAgoIso).order('created_at', { ascending: false }),
    sb.from('goals').select('date, done').gte('date', sevenAgo).lte('date', today),
    sb.from('diary_entries').select('date, body, mood').gte('date', sevenAgo).lte('date', today).order('date', { ascending: false }),
  ]);

  const habits = habitsRes.data ?? [];
  const completions = completionsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const sets = setsRes.data ?? [];
  const urges = urgesRes.data ?? [];

  const settings: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
  const streakDays = settings['sobriety_start']
    ? Math.floor((Date.now() - new Date(settings['sobriety_start']).getTime()) / 86400000)
    : null;

  // Habit stats — "hit" means the daily count met goal_value (daily-period habits) or the
  // weekly count met goal_value (weekly-period habits). Matches habit-coach's definition so
  // the two routes can't contradict each other on the same habit.
  const dailyByHabit = new Map<string, Map<string, number>>();
  for (const c of completions) {
    const m = dailyByHabit.get(c.habit_id) ?? new Map<string, number>();
    m.set(c.date, c.count);
    dailyByHabit.set(c.habit_id, m);
  }
  const habitSummary = habits.map(h => {
    const goal = h.goal_value as number;
    const period = h.goal_period as string;
    const counts = [...(dailyByHabit.get(h.id)?.values() ?? [])];
    if (period === 'day') {
      const daysHit = counts.filter(n => n >= goal).length;
      return `${h.name}: hit goal ${daysHit}/7 days (goal ${goal}× per day)`;
    }
    const total = counts.reduce((s, n) => s + n, 0);
    if (period === 'week') {
      return `${h.name}: ${total}/${goal} this week — weekly goal ${total >= goal ? 'hit' : 'not hit'} (goal ${goal}× per week)`;
    }
    return `${h.name}: ${total} this week toward monthly goal of ${goal}× (partial window)`;
  });

  // Gym stats
  const workoutCount = sessions.length;
  const totalDuration = sessions.reduce((s, sess) => s + (sess.duration_seconds ?? 0), 0);
  const volumeByExercise: Record<string, number> = {};
  for (const s of sets) {
    volumeByExercise[s.exercise] = (volumeByExercise[s.exercise] ?? 0) + s.reps * s.weight;
  }
  const topExercises = Object.entries(volumeByExercise).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, v]) => `${e} (${Math.round(v)} lbs total volume)`);

  // Finance stats
  const nwHistory = nwHistoryRes.data ?? [];
  const nwChange = nwHistory.length >= 2 ? nwHistory[nwHistory.length - 1].total - nwHistory[0].total : null;
  function toMonthlyRate(amount: number, cycle: string) {
    if (cycle === 'yearly') return amount / 12;
    if (cycle === 'quarterly') return amount / 3;
    if (cycle === 'weekly') return (amount * 52) / 12;
    return amount;
  }
  const monthlyBurn = (subsRes.data ?? []).reduce((s, sub) => s + toMonthlyRate(sub.amount, sub.billing_cycle), 0);

  // Urge stats
  const urgeCount = urges.length;
  const avgIntensity = urges.length ? (urges.reduce((s, u) => s + u.intensity, 0) / urges.length).toFixed(1) : null;

  // Relapses this week — most important signal if present
  const relapses = relapsesRes.data ?? [];
  const relapseLines = relapses.map(r => {
    const d = new Date(r.created_at);
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })}${r.note ? ` — "${r.note}"` : ''}`;
  });

  // Daily goals stats
  const goalRows = goalsRes.data ?? [];
  const goalDates = new Set(goalRows.map(g => g.date));
  const goalsSetDays = goalDates.size;
  const totalGoals = goalRows.length;
  const goalsDone = goalRows.filter(g => g.done).length;
  const goalCompletionPct = totalGoals > 0 ? Math.round((goalsDone / totalGoals) * 100) : null;

  // Per-exercise progression: compare max weight in first half vs second half of week
  const halfDate = toDateStr(new Date(Date.now() - 3.5 * 86400000));
  const exerciseMax: Record<string, { first: number; last: number }> = {};
  for (const s of sets) {
    const half = s.date <= halfDate ? 'first' : 'last';
    if (!exerciseMax[s.exercise]) exerciseMax[s.exercise] = { first: 0, last: 0 };
    if (s.weight > exerciseMax[s.exercise][half]) exerciseMax[s.exercise][half] = s.weight;
  }
  const progressions = Object.entries(exerciseMax)
    .filter(([, m]) => m.first > 0 && m.last > 0 && m.last > m.first)
    .map(([ex, m]) => ({ ex, first: m.first, last: m.last, gain: ((m.last - m.first) / m.first) * 100 }))
    .filter(p => p.gain >= 2.5)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 4);

  // Cross-domain patterns — precomputed over a 30-day window (own window, independent of the 7-day stats above)
  const correlations = await correlationsPromise;
  const patternBlock = correlations.length
    ? '\nCROSS-DOMAIN PATTERNS (precomputed from the last 30 days — exact numbers, cite verbatim, do not invent others):\n'
      + correlations.map(c => `- ${c.finding} [${c.strength}, ${c.samples.a} vs ${c.samples.b} days${c.confidence === 'low' ? ', rough estimate' : ''}]`).join('\n')
    : '';

  const goalsBlock = totalGoals === 0
    ? '- No daily goals were set this week'
    : `- Goals set on ${goalsSetDays}/7 days\n- ${goalsDone}/${totalGoals} completed${goalCompletionPct !== null ? ` (${goalCompletionPct}%)` : ''}`;

  // Diary entries — first-person reflections give the model qualitative texture
  // alongside the quantitative stats. Trim each entry to keep token cost bounded.
  const diaryEntries = (diaryRes.data ?? []).filter((d): d is { date: string; body: string; mood: number | null } => !!(d.body as string)?.trim());
  const diaryBlock = diaryEntries.length === 0
    ? ''
    : `\nDIARY ENTRIES THIS WEEK (newest first; mood 1=rough, 5=great):\n` + diaryEntries.map(d => {
        const m = d.mood ? ` [mood ${d.mood}/5]` : '';
        const trimmed = d.body.trim().replace(/\s+/g, ' ').slice(0, 480);
        return `- ${d.date}${m}: "${trimmed}${d.body.length > 480 ? '…' : ''}"`;
      }).join('\n');

  const prompt = `Weekly review data (last 7 days). Every number below is verified ground truth — cite exactly, never inflate, never state X/Y where X > Y, never invent stats not shown here.

HABITS (${habits.length} total):
${habitSummary.length ? habitSummary.join('\n') : 'No habits tracked'}

DAILY GOALS:
${goalsBlock}

GYM:
- Workouts completed: ${workoutCount}
- Total time: ${Math.round(totalDuration / 60)} minutes
- Top exercises by volume: ${topExercises.length ? topExercises.join(', ') : 'none'}
${progressions.length ? `- Progression: ${progressions.map(p => `${p.ex} ${p.first}→${p.last} lbs (+${p.gain.toFixed(1)}%)`).join(', ')}` : ''}

RECOVERY:
- Current streak: ${streakDays !== null ? `${streakDays} days` : 'not set'}
- Urges this week: ${urgeCount}${avgIntensity ? ` (avg intensity ${avgIntensity}/5)` : ''}
${relapses.length > 0 ? `- RELAPSES THIS WEEK: ${relapses.length} — ${relapseLines.join('; ')}` : '- No relapses this week'}

FINANCE:
- Net worth change this week: ${nwChange !== null ? `${nwChange >= 0 ? '+' : '−'}$${Math.abs(Math.round(nwChange)).toLocaleString()}` : 'no data'}
- Monthly subscriptions: $${monthlyBurn.toFixed(0)}/mo
${patternBlock}${diaryBlock}

Return JSON with this exact shape:
{"summary":"2-3 sentence overall summary of the week","wins":["2-3 specific wins based on their data"],"improvements":["2-3 specific areas to improve"],"plan":["3-4 concrete action items for next week based on the data"]}

If CROSS-DOMAIN PATTERNS are listed above, reference the meaningful ones as a win or plan item — phrase them as observed associations (not proven cause) and use the exact numbers given. Do NOT invent any correlation that is not in that list.

If DIARY ENTRIES are listed above, use them as qualitative context for the wins/improvements/plan — e.g. if multiple entries mention poor sleep, surface that as an improvement with a concrete plan. Do not quote large passages. Reflect the user's own language briefly rather than restating it.`;

  const raw = await callAI(prompt, 'You are a personal coach giving a weekly review. Hard rules: (1) Use ONLY numbers shown in the data block. Never state X/Y where X > Y. Never compute new ratios or invent figures. If a habit reads "hit goal 5/7 days", you cannot say "5 out of 8" or "6/7". (2) Every win, improvement, and plan item must reference a specific number from the data AND suggest a concrete action — not vague encouragement. (3) BANNED filler phrases (use specifics instead): "great foundation", "spiritual anchor", "commendable", "keep nurturing", "small consistent steps", "wonderful work", "amazing job", "renewed focus". (4) When goals were set on 0/7 days, don\'t say "0/0 completed needs attention" — say plainly they weren\'t set and suggest one starter goal. (5) If there were relapses this week, address them first in the summary with compassion and grace — never gloss over them, but frame the rest of the week as resilience and a chance to learn. Respond with compact JSON only — no markdown. The user is Muslim. Where it feels genuine, reference Islamic values once — gratitude (alhamdulillah), reflecting on blessings, sabr. Subtle and restrained, never preachy.', 2000);
  const result = parseJSON<ReviewResponse>(raw);

  return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[weekly-review] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
