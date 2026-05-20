import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

interface ReviewResponse { summary: string; wins: string[]; improvements: string[]; plan: string[] }

export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  const sb = supabaseServer();
  const today = toDateStr(new Date());
  const sevenAgo = toDateStr(new Date(Date.now() - 7 * 86400000));

  const [habitsRes, completionsRes, sessionsRes, setsRes, urgesRes, settingsRes, nwHistoryRes, subsRes] = await Promise.all([
    sb.from('habits').select('id, name, goal_value, goal_period').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, date, count').gte('date', sevenAgo).lte('date', today),
    sb.from('gym_sessions').select('date, duration_seconds, split_days(name)').gte('date', sevenAgo).lte('date', today),
    sb.from('gym_sets').select('date, exercise, reps, weight').gte('date', sevenAgo).lte('date', today),
    sb.from('recovery_urges').select('intensity, created_at').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    sb.from('recovery_settings').select('key, value'),
    sb.from('finance_nw_history').select('total, snapshot_date').gte('snapshot_date', sevenAgo).lte('snapshot_date', today).order('snapshot_date'),
    sb.from('finance_subscriptions').select('amount, billing_cycle'),
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

  // Habit stats
  const compByHabit: Record<string, number> = {};
  for (const c of completions) compByHabit[c.habit_id] = (compByHabit[c.habit_id] ?? 0) + (c.count >= 1 ? 1 : 0);
  const habitSummary = habits.map(h => {
    const daysHit = compByHabit[h.id] ?? 0;
    return `${h.name}: ${daysHit}/7 days`;
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

  const prompt = `Weekly review data (last 7 days):

HABITS (${habits.length} total):
${habitSummary.length ? habitSummary.join('\n') : 'No habits tracked'}

GYM:
- Workouts completed: ${workoutCount}
- Total time: ${Math.round(totalDuration / 60)} minutes
- Top exercises by volume: ${topExercises.length ? topExercises.join(', ') : 'none'}

RECOVERY:
- Current streak: ${streakDays !== null ? `${streakDays} days` : 'not set'}
- Urges this week: ${urgeCount}${avgIntensity ? ` (avg intensity ${avgIntensity}/5)` : ''}

FINANCE:
- Net worth change this week: ${nwChange !== null ? `${nwChange >= 0 ? '+' : '−'}$${Math.abs(Math.round(nwChange)).toLocaleString()}` : 'no data'}
- Monthly subscriptions: $${monthlyBurn.toFixed(0)}/mo

Return JSON with this exact shape:
{"summary":"2-3 sentence overall summary of the week","wins":["2-3 specific wins based on their data"],"improvements":["2-3 specific areas to improve"],"plan":["3-4 concrete action items for next week based on the data"]}

Look for cross-domain patterns — e.g. does working out correlate with fewer urges? Does missing habits affect gym consistency? Include any meaningful connection as a win or plan item.`;

  const raw = await callAI(prompt, 'You are a personal coach giving a weekly review. Be specific, reference their actual numbers, be honest but encouraging. Respond with compact JSON only — no markdown. The user is Muslim. Where it feels genuine, reference Islamic values — gratitude (alhamdulillah), reflecting on blessings, perseverance. Subtle and restrained.', 1200);
  const result = parseJSON<ReviewResponse>(raw);

  return NextResponse.json(result);
}
