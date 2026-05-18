import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI } from '@/lib/ai';

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  const sb = supabaseServer();
  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  const todayDow = new Date().getDay();

  const [habitsRes, todayCompRes, yesterdayCompRes, splitsRes, settingsRes, urgesRes] = await Promise.all([
    sb.from('habits').select('id, name, goal_value, goal_period').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, count').eq('date', today),
    sb.from('habit_completions').select('habit_id, count').eq('date', yesterday),
    sb.from('splits').select('name, split_days(name, day_of_week)').eq('is_active', true).limit(1),
    sb.from('recovery_settings').select('key, value'),
    sb.from('recovery_urges').select('intensity, note, created_at').order('created_at', { ascending: false }).limit(3),
  ]);

  const habits = habitsRes.data ?? [];
  const todayComp: Record<string, number> = {};
  for (const c of todayCompRes.data ?? []) todayComp[c.habit_id] = c.count;
  const yesterdayComp: Record<string, number> = {};
  for (const c of yesterdayCompRes.data ?? []) yesterdayComp[c.habit_id] = c.count;

  const habitsDoneToday = habits.filter(h => (todayComp[h.id] ?? 0) >= h.goal_value).length;
  const yesterdayDone = habits.filter(h => (yesterdayComp[h.id] ?? 0) >= h.goal_value).length;

  const settings: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
  const sobrietyStart = settings['sobriety_start'];
  const streakDays = sobrietyStart
    ? Math.floor((Date.now() - new Date(sobrietyStart).getTime()) / 86400000)
    : null;

  const activeSplit = splitsRes.data?.[0];
  const todayWorkout = activeSplit
    ? (activeSplit.split_days as { name: string; day_of_week: number[] | null }[])
        .find(d => d.day_of_week?.includes(todayDow))?.name ?? null
    : null;

  const urges = urgesRes.data ?? [];
  const recentUrgeNote = urges[0]?.note ? `Most recent urge note: "${urges[0].note}"` : '';

  const context = [
    `Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    habits.length > 0 ? `Habits: ${habitsDoneToday}/${habits.length} completed so far today; yesterday ${yesterdayDone}/${habits.length} were completed` : 'No habits tracked yet',
    todayWorkout ? `Today's scheduled workout: ${todayWorkout} (${activeSplit!.name})` : activeSplit ? `No workout scheduled for today in ${activeSplit.name}` : 'No active workout split',
    streakDays !== null ? `Recovery streak: ${streakDays} days` : 'No recovery streak set',
    urges.length > 0 ? `Recent urges: ${urges.length} logged recently, avg intensity ${(urges.reduce((s, u) => s + u.intensity, 0) / urges.length).toFixed(1)}/5. ${recentUrgeNote}` : 'No recent urges logged',
  ].join('\n');

  const briefing = await callAI(
    context,
    'You are a personal coach writing a morning briefing for your client. Be warm, specific to their data, and motivating without being preachy. Write 3–4 sentences. Reference their actual numbers. End with one concrete intention for today.',
    300,
  );

  return NextResponse.json({ briefing });
}
