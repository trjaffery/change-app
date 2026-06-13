import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Momentum — earned aggregate numbers from the user's own log. Stats only,
 * no per-event timeline (the urge log itself is the timeline).
 */

interface MomentumResponse {
  stats: {
    current_streak: number | null;
    longest_streak: number | null;
    crisis_survived: number;
    mood_high_days_30: number;
    urges_no_act: number;
    urges_no_act_since: string | null; // ISO; null when no streak anchor exists
  };
}

function diffDays(a: Date, b: Date): number {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86400000));
}

export async function GET() {
  const sb = supabaseServer();
  const thirtyAgoDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [settingsRes, relapsesRes, urgesRes, diaryRes] = await Promise.all([
    sb.from('recovery_settings').select('key, value'),
    sb.from('recovery_relapses').select('created_at').order('created_at', { ascending: true }),
    sb.from('recovery_urges').select('intensity, note, is_crisis, created_at').order('created_at', { ascending: false }),
    sb.from('diary_entries').select('date, mood').gte('date', thirtyAgoDate).not('mood', 'is', null).order('date', { ascending: false }),
  ]);

  const settings: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
  const sobrietyStart = settings['sobriety_start'] ?? null;
  const relapses = (relapsesRes.data ?? []) as { created_at: string }[];

  // ── Longest + current streak ────────────────────────────────────────
  let longest: number | null = null;
  let current: number | null = null;
  if (sobrietyStart || relapses.length > 0) {
    const anchors: Date[] = [];
    if (sobrietyStart) anchors.push(new Date(sobrietyStart));
    for (const r of relapses) anchors.push(new Date(r.created_at));
    anchors.sort((a, b) => a.getTime() - b.getTime());
    const gaps: number[] = [];
    for (let i = 0; i < anchors.length - 1; i++) gaps.push(diffDays(anchors[i + 1], anchors[i]));
    const since = anchors[anchors.length - 1];
    current = diffDays(new Date(), since);
    gaps.push(current);
    longest = gaps.reduce((m, g) => Math.max(m, g), 0);
  }

  // ── Crisis-level urge count ─────────────────────────────────────────
  const urges = (urgesRes.data ?? []) as { intensity: number; note: string | null; is_crisis: boolean | null; created_at: string }[];
  const crisisUrges = urges.filter(u => u.is_crisis || (u.note ?? '').startsWith('[crisis-mode]'));

  // ── Mood-high days in last 30 ───────────────────────────────────────
  const diary = (diaryRes.data ?? []) as { date: string; mood: number | null }[];
  const moodHighDays30 = diary.filter(d => d.mood !== null && d.mood >= 4).length;

  // ── Urges logged since the current streak began that the user *didn't*
  // act on. The streak's anchor is whichever is more recent: sobriety_start
  // or the latest relapse. If neither exists, count all-time.
  // Excludes crisis-flagged urges (counted separately) and urges that had a
  // relapse within 24h after (those were acted on by definition).
  const latestRelapseMs = relapses.length ? new Date(relapses[relapses.length - 1].created_at).getTime() : 0;
  const sobrietyStartMs = sobrietyStart ? new Date(sobrietyStart).getTime() : 0;
  const streakAnchorMs = Math.max(latestRelapseMs, sobrietyStartMs);
  const streakAnchorIso = streakAnchorMs > 0 ? new Date(streakAnchorMs).toISOString() : null;

  const relapseTimes = relapses.map(r => new Date(r.created_at).getTime());
  function relapseWithin24h(after: Date): boolean {
    const t = after.getTime();
    return relapseTimes.some(rt => rt > t && rt - t <= 86400000);
  }
  let urgesNoAct = 0;
  for (const u of urges) {
    const t = new Date(u.created_at).getTime();
    if (streakAnchorMs && t < streakAnchorMs) break; // urges are sorted desc; anything older is outside the streak
    const isCrisis = u.is_crisis || (u.note ?? '').startsWith('[crisis-mode]');
    if (!relapseWithin24h(new Date(u.created_at)) && !isCrisis) urgesNoAct++;
  }

  return NextResponse.json({
    stats: {
      current_streak: current,
      longest_streak: longest,
      crisis_survived: crisisUrges.length,
      mood_high_days_30: moodHighDays30,
      urges_no_act: urgesNoAct,
      urges_no_act_since: streakAnchorIso,
    },
  } satisfies MomentumResponse);
}
