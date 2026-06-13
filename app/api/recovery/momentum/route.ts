import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Momentum — earned numbers + recent specific wins. Replaces a static coping-
 * tips grid that nobody reads twice. Everything here comes from the user's
 * own log and surfaces effort they already put in.
 */

interface Win {
  kind: 'surf' | 'crisis' | 'urge_no_act' | 'high_mood';
  date: string; // ISO timestamp for sort order
  label: string;
}

interface MomentumResponse {
  stats: {
    current_streak: number | null;
    longest_streak: number | null;
    crisis_survived: number;
    surfs_completed: number;
    surfs_total: number;
    mood_high_days_30: number;
    urges_no_act_30: number;
  };
  recent_wins: Win[];
}

function toIso(d: Date | string) { return new Date(d).toISOString(); }

function diffDays(a: Date, b: Date): number {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86400000));
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function GET() {
  const sb = supabaseServer();
  const thirtyAgoIso = new Date(Date.now() - 30 * 86400000).toISOString();
  const thirtyAgoDate = thirtyAgoIso.split('T')[0];

  const [settingsRes, relapsesRes, urgesRes, surfsRes, diaryRes] = await Promise.all([
    sb.from('recovery_settings').select('key, value'),
    sb.from('recovery_relapses').select('created_at').order('created_at', { ascending: true }),
    sb.from('recovery_urges').select('intensity, note, is_crisis, created_at').order('created_at', { ascending: false }),
    sb.from('urge_surfs').select('full_completion, completed_seconds, surfed_at').order('surfed_at', { ascending: false }),
    sb.from('diary_entries').select('date, mood, body').gte('date', thirtyAgoDate).not('mood', 'is', null).order('date', { ascending: false }),
  ]);

  const settings: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
  const sobrietyStart = settings['sobriety_start'] ?? null;
  const relapses = (relapsesRes.data ?? []) as { created_at: string }[];

  // ── Longest + current streak ────────────────────────────────────────
  // Walk through anchored start → each relapse → now, capturing every gap.
  let longest: number | null = null;
  let current: number | null = null;
  if (sobrietyStart || relapses.length > 0) {
    const anchors: Date[] = [];
    if (sobrietyStart) anchors.push(new Date(sobrietyStart));
    for (const r of relapses) anchors.push(new Date(r.created_at));
    // Sort ascending and dedupe by trimming microseconds.
    anchors.sort((a, b) => a.getTime() - b.getTime());

    const gaps: number[] = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      gaps.push(diffDays(anchors[i + 1], anchors[i]));
    }
    const since = anchors[anchors.length - 1];
    current = diffDays(new Date(), since);
    gaps.push(current);
    longest = gaps.reduce((m, g) => Math.max(m, g), 0);
  }

  // ── Crisis-level urge count (structural flag, set either by the Crisis
  // Mode "I made it" flow or by the user editing a past urge). Legacy
  // [crisis-mode] note prefix is also honored so pre-backfill data still
  // counts even if someone forgot to run the SQL migration.
  const urges = (urgesRes.data ?? []) as { intensity: number; note: string | null; is_crisis: boolean | null; created_at: string }[];
  const crisisUrges = urges.filter(u => u.is_crisis || (u.note ?? '').startsWith('[crisis-mode]'));

  // ── Surf success ─────────────────────────────────────────────────────
  const surfs = (surfsRes.data ?? []) as { full_completion: boolean; completed_seconds: number; surfed_at: string }[];
  const surfsCompleted = surfs.filter(s => s.full_completion);

  // ── Mood-high days in last 30 ───────────────────────────────────────
  const diary = (diaryRes.data ?? []) as { date: string; mood: number | null; body: string }[];
  const moodHighDays30 = diary.filter(d => d.mood !== null && d.mood >= 4).length;

  // ── Urges logged but no relapse within next 24h (last 30 days) ───────
  // A meaningful win — you felt the heat and chose not to act.
  const relapseTimes = relapses.map(r => new Date(r.created_at).getTime());
  function relapseWithin24h(after: Date): boolean {
    const t = after.getTime();
    return relapseTimes.some(rt => rt > t && rt - t <= 86400000);
  }
  const urgesNoAct30: { intensity: number; note: string | null; is_crisis: boolean | null; created_at: string }[] = [];
  for (const u of urges) {
    const t = new Date(u.created_at).getTime();
    if (t < Date.now() - 30 * 86400000) break; // urges already sorted desc
    const isCrisis = u.is_crisis || (u.note ?? '').startsWith('[crisis-mode]');
    if (u.intensity >= 3 && !relapseWithin24h(new Date(u.created_at)) && !isCrisis) {
      urgesNoAct30.push(u);
    }
  }

  // ── Recent specific wins (5 most recent across all sources) ─────────
  const wins: Win[] = [];
  for (const s of surfsCompleted.slice(0, 8)) {
    wins.push({
      kind: 'surf',
      date: toIso(s.surfed_at),
      label: `Surfed an urge — ${Math.max(1, Math.round(s.completed_seconds / 60))} min`,
    });
  }
  for (const u of crisisUrges.slice(0, 8)) {
    wins.push({
      kind: 'crisis',
      date: toIso(u.created_at),
      label: 'Made it through crisis mode',
    });
  }
  for (const u of urgesNoAct30.slice(0, 8)) {
    wins.push({
      kind: 'urge_no_act',
      date: toIso(u.created_at),
      label: `Felt a ${u.intensity}/5 urge — didn't act`,
    });
  }
  for (const d of diary.slice(0, 5)) {
    if (d.mood !== null && d.mood >= 5) {
      wins.push({
        kind: 'high_mood',
        date: toIso(d.date + 'T12:00:00'),
        label: `Mood 5/5 — ${formatShortDate(d.date + 'T12:00:00')}`,
      });
    }
  }
  wins.sort((a, b) => b.date.localeCompare(a.date));
  const recentWins = wins.slice(0, 5);

  return NextResponse.json({
    stats: {
      current_streak: current,
      longest_streak: longest,
      crisis_survived: crisisUrges.length,
      surfs_completed: surfsCompleted.length,
      surfs_total: surfs.length,
      mood_high_days_30: moodHighDays30,
      urges_no_act_30: urgesNoAct30.length,
    },
    recent_wins: recentWins,
  } satisfies MomentumResponse);
}
