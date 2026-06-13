import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Aggregated stats for the Urge Patterns dashboard. Computed server-side so the
 * client only ever does one round-trip and so the same date arithmetic backs
 * both these cards and the AI prompt in /api/ai/recovery-patterns.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function timeBucket(d: Date): 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
  const h = d.getHours();
  if (h >= 6 && h < 12) return 'Morning';
  if (h >= 12 && h < 18) return 'Afternoon';
  if (h >= 18 && h < 22) return 'Evening';
  return 'Night';
}

export async function GET() {
  const sb = supabaseServer();
  const { data: urgesData } = await sb.from('recovery_urges').select('intensity, tags, created_at').order('created_at', { ascending: false });
  const urges = (urgesData ?? []) as Array<{ intensity: number; tags: string[] | null; created_at: string }>;

  const now = Date.now();
  const last7Cut = now - 7 * 86400000;
  const prior7Cut = now - 14 * 86400000;
  const last30Cut = now - 30 * 86400000;

  // ── 7d vs prior 7d window ───────────────────────────────────────────────
  const last7 = urges.filter(u => new Date(u.created_at).getTime() >= last7Cut);
  const prior7 = urges.filter(u => { const t = new Date(u.created_at).getTime(); return t >= prior7Cut && t < last7Cut; });
  const last7Avg = last7.length ? last7.reduce((s, u) => s + u.intensity, 0) / last7.length : null;
  const prior7Avg = prior7.length ? prior7.reduce((s, u) => s + u.intensity, 0) / prior7.length : null;

  const overallAvg = urges.length ? urges.reduce((s, u) => s + u.intensity, 0) / urges.length : 0;

  // ── Tag impact (all tags, ranked by avg intensity = "harm") ─────────────
  const tagAgg: Record<string, { count: number; intensitySum: number }> = {};
  for (const u of urges) {
    for (const t of (u.tags ?? [])) {
      tagAgg[t] = tagAgg[t] ?? { count: 0, intensitySum: 0 };
      tagAgg[t].count++;
      tagAgg[t].intensitySum += u.intensity;
    }
  }
  // "Worst" tags: ranked by avg intensity. Min count guard so a one-off doesn't
  // dominate. The frequency view is included separately so the UI can show both.
  const allTags = Object.entries(tagAgg).map(([name, v]) => ({
    name,
    count: v.count,
    avg_intensity: v.intensitySum / v.count,
    delta_vs_overall: (v.intensitySum / v.count) - overallAvg,
  }));
  const worstByHarm = allTags
    .filter(t => t.count >= 2)
    .sort((a, b) => b.avg_intensity - a.avg_intensity || b.count - a.count)
    .slice(0, 6);
  const byFrequency = allTags
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // ── Hot times: day-of-week × time-bucket cross-tab; emit top 3 cells ────
  const cell: Record<string, number> = {};
  for (const u of urges) {
    const d = new Date(u.created_at);
    const k = `${d.getDay()}|${timeBucket(d)}`;
    cell[k] = (cell[k] ?? 0) + 1;
  }
  const hotTimes = Object.entries(cell)
    .map(([k, count]) => { const [dow, bucket] = k.split('|'); return { day: DAYS[Number(dow)], bucket, count }; })
    .filter(c => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // ── 30-day daily trend (newest at end, for left-to-right bar chart) ─────
  const daily: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const key = d.toISOString().split('T')[0];
    daily.push({ date: key, count: urges.filter(u => u.created_at.startsWith(key)).length });
  }
  const daysWithUrges30 = urges.filter(u => new Date(u.created_at).getTime() >= last30Cut).length;

  return NextResponse.json({
    totals: {
      urges: urges.length,
      urges_last30: daysWithUrges30,
    },
    window: {
      last_count: last7.length,
      prior_count: prior7.length,
      last_avg_intensity: last7Avg,
      prior_avg_intensity: prior7Avg,
    },
    overall_avg_intensity: overallAvg,
    tags_by_harm: worstByHarm,
    tags_by_frequency: byFrequency,
    hot_times: hotTimes,
    daily_30d: daily,
  });
}
