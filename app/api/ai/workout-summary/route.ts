import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI } from '@/lib/ai';

interface SetRow { exercise: string; reps: number; weight: number; date: string }
interface PRItem { exercise: string; weight: number; reps: number; previous: number }
interface SummaryResponse {
  totals: { volume: number; sets: number; exercises: number; duration_minutes: number | null };
  prs: PRItem[];
  volume_delta_pct: number | null;
  prior_avg_volume: number | null;
  note: string | null;
}

function setVolume(s: { reps: number; weight: number }): number {
  return s.reps * s.weight;
}

/**
 * POST { session_id } — deterministic post-workout summary. Only spends tokens
 * when something notable happened: a new PR, or volume materially below the
 * recent average for this split day. Otherwise `note` is null.
 */
export async function POST(req: NextRequest) {
  try {
    const { session_id } = await req.json() as { session_id: string };
    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

    const sb = supabaseServer();
    const { data: sessionRow, error: sessionErr } = await sb
      .from('gym_sessions')
      .select('id, date, split_day_id, duration_seconds')
      .eq('id', session_id)
      .maybeSingle();
    if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    if (!sessionRow) return NextResponse.json({ error: 'session not found' }, { status: 404 });

    // Sets done in this session — single-user app, date alone identifies them.
    const { data: todaySets } = await sb
      .from('gym_sets')
      .select('exercise, reps, weight, date')
      .eq('date', sessionRow.date);
    const sets = (todaySets ?? []) as SetRow[];

    const exercises = Array.from(new Set(sets.map(s => s.exercise)));
    const volume = sets.reduce((s, x) => s + setVolume(x), 0);

    // PR detection: heaviest weight × reps per exercise vs prior all-time max.
    const allTimeRes = await sb.from('gym_sets').select('exercise, weight, reps, date').in('exercise', exercises).lt('date', sessionRow.date);
    const priorMax: Record<string, number> = {};
    for (const r of (allTimeRes.data ?? []) as SetRow[]) {
      if (!priorMax[r.exercise] || r.weight > priorMax[r.exercise]) priorMax[r.exercise] = r.weight;
    }
    const todayMax: Record<string, { weight: number; reps: number }> = {};
    for (const r of sets) {
      const cur = todayMax[r.exercise];
      if (!cur || r.weight > cur.weight) todayMax[r.exercise] = { weight: r.weight, reps: r.reps };
    }
    const prs: PRItem[] = [];
    for (const [ex, t] of Object.entries(todayMax)) {
      const prev = priorMax[ex] ?? 0;
      if (t.weight > prev && prev > 0) prs.push({ exercise: ex, weight: t.weight, reps: t.reps, previous: prev });
    }

    // Volume delta vs the last 3 sessions of the same split day.
    let priorAvgVolume: number | null = null;
    let volumeDeltaPct: number | null = null;
    if (sessionRow.split_day_id) {
      const { data: priorSessions } = await sb
        .from('gym_sessions')
        .select('date')
        .eq('split_day_id', sessionRow.split_day_id)
        .lt('date', sessionRow.date)
        .order('date', { ascending: false })
        .limit(3);
      const priorDates = (priorSessions ?? []).map(s => s.date);
      if (priorDates.length > 0) {
        const { data: priorSets } = await sb.from('gym_sets').select('reps, weight, date').in('date', priorDates);
        const byDate: Record<string, number> = {};
        for (const r of (priorSets ?? []) as { reps: number; weight: number; date: string }[]) {
          byDate[r.date] = (byDate[r.date] ?? 0) + setVolume(r);
        }
        const volumes = Object.values(byDate);
        if (volumes.length > 0) {
          priorAvgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;
          if (priorAvgVolume > 0) volumeDeltaPct = ((volume - priorAvgVolume) / priorAvgVolume) * 100;
        }
      }
    }

    // Only call AI when something is worth highlighting.
    let note: string | null = null;
    const lowVolume = volumeDeltaPct !== null && volumeDeltaPct <= -15;
    if ((prs.length > 0 || lowVolume) && process.env.GOOGLE_API_KEY) {
      const prSummary = prs.map(p => `${p.exercise}: ${p.weight} lb × ${p.reps} (prev max ${p.previous} lb)`).join('; ');
      const prompt = `Workout just finished. ${prs.length > 0 ? `PRs hit: ${prSummary}.` : ''} ${volumeDeltaPct !== null ? `Total volume ${Math.round(volume)} lb-reps; recent avg for this day was ${Math.round(priorAvgVolume!)} lb-reps (delta ${volumeDeltaPct.toFixed(0)}%).` : ''}

Write ONE sentence (≤25 words) calibration note: if a PR landed, congratulate specifically; if volume is materially low, name it without judgment and suggest one cause to check (sleep, food, deload-due). No platitudes.`;
      try {
        note = (await callAI(prompt, 'You write one calibration sentence after a workout. Specific, no platitudes.', 120)).trim();
      } catch { note = null; }
    }

    return NextResponse.json({
      totals: {
        volume: Math.round(volume),
        sets: sets.length,
        exercises: exercises.length,
        duration_minutes: sessionRow.duration_seconds ? Math.round(sessionRow.duration_seconds / 60) : null,
      },
      prs,
      volume_delta_pct: volumeDeltaPct,
      prior_avg_volume: priorAvgVolume,
      note,
    } satisfies SummaryResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[workout-summary] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
