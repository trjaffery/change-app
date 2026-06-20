import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/gym/history?exercise=Bench+Press
// Returns [{date, maxWeight, sets}] sorted ascending
export async function GET(req: NextRequest) {
  const exercise = req.nextUrl.searchParams.get('exercise');
  if (!exercise) return NextResponse.json({ error: 'exercise required' }, { status: 400 });
  const db = supabaseServer();
  const { data, error } = await db
    .from('gym_sets')
    .select('date, reps, weight')
    .ilike('exercise', exercise)
    .order('date')
    .order('position');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by date
  const byDate: Record<string, { reps: number; weight: number }[]> = {};
  for (const row of data) {
    if (!byDate[row.date]) byDate[row.date] = [];
    byDate[row.date].push({ reps: row.reps, weight: Number(row.weight) });
  }

  // Phase 3 #16: join the per-session RPE so the progression algorithm can
  // bias the next-set suggestion (RPE 9 → repeat; RPE 4 + hit → bigger jump).
  const dates = Object.keys(byDate);
  const rpeByDate: Record<string, number | null> = {};
  if (dates.length) {
    const { data: sessRows } = await db
      .from('gym_sessions')
      .select('date, rpe, started_at')
      .in('date', dates)
      .order('started_at', { ascending: false });
    for (const r of sessRows ?? []) {
      if (!(r.date in rpeByDate)) rpeByDate[r.date] = (r.rpe as number | null) ?? null;
    }
  }

  const history = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sets]) => ({ date, maxWeight: Math.max(...sets.map(s => s.weight)), sets, rpe: rpeByDate[date] ?? null }));
  return NextResponse.json(history);
}
