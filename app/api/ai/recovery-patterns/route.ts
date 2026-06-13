import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';

interface Observation { headline: string; detail: string; reference?: string }
interface PlanSuggestion { field: 'triggers' | 'warning_signs' | 'replacement_behaviors'; text: string }
interface Insights { observations: Observation[]; plan_suggestions: PlanSuggestion[]; crisis_line?: string }
interface CacheRow { urge_count: number; surf_count: number; generated_at: string; insights: Insights | Record<string, never> }

const STOPWORDS = new Set(['i', 'a', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'it', 'was', 'is', 'my', 'me', 'had', 'at', 'so', 'just', 'an', 'for', 'on', 'with', 'that', 'this', 'felt', 'feel']);

// GET — return cached insights + a staleness flag the client can use to decide
// whether to background-trigger a regen. Stale = current totals differ from
// what was cached. No row yet → empty insights, stale=true.
export async function GET() {
  const sb = supabaseServer();
  const [cacheRes, urgeCountRes, surfCountRes] = await Promise.all([
    sb.from('rp_patterns_cache').select('urge_count, surf_count, generated_at, insights').eq('id', 1).maybeSingle(),
    sb.from('recovery_urges').select('id', { count: 'exact', head: true }),
    sb.from('urge_surfs').select('id', { count: 'exact', head: true }),
  ]);

  const currentUrges = urgeCountRes.count ?? 0;
  const currentSurfs = surfCountRes.count ?? 0;
  const cache = cacheRes.data as CacheRow | null;
  const insights = (cache?.insights && 'observations' in cache.insights) ? cache.insights : null;
  const stale = !insights || cache!.urge_count !== currentUrges || cache!.surf_count !== currentSurfs;

  return NextResponse.json({
    insights,
    generated_at: cache?.generated_at ?? null,
    cached_urge_count: cache?.urge_count ?? 0,
    current_urge_count: currentUrges,
    stale,
  });
}

// POST — regenerate insights and upsert the cache row. Returns the fresh insights.
export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const sb = supabaseServer();
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const [urgesRes, surfsRes, settingsRes, diaryRes, planRes] = await Promise.all([
      sb.from('recovery_urges').select('intensity, note, tags, created_at').order('created_at', { ascending: true }),
      sb.from('urge_surfs').select('completed_seconds, full_completion, surfed_at').order('surfed_at', { ascending: true }),
      sb.from('recovery_settings').select('key, value'),
      sb.from('diary_entries').select('date, body, mood').gte('date', thirtyAgo).order('date', { ascending: false }),
      sb.from('rp_plan').select('triggers, warning_signs, replacement_behaviors, why').eq('id', 1).maybeSingle(),
    ]);

    const urges = (urgesRes.data ?? []) as Array<{ intensity: number; note: string | null; tags: string[] | null; created_at: string }>;
    const surfs = (surfsRes.data ?? []) as Array<{ completed_seconds: number; full_completion: boolean; surfed_at: string }>;
    const settings: Record<string, string> = {};
    for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
    const sobrietyStart = settings['sobriety_start'] ?? null;
    const streakDays = sobrietyStart ? Math.floor((Date.now() - new Date(sobrietyStart).getTime()) / 86400000) : null;

    if (urges.length < 3) {
      const insights: Insights = {
        observations: [{ headline: 'Not enough data yet', detail: `Log a few more urges and the analysis gets specific. Right now you have ${urges.length} on record.` }],
        plan_suggestions: [],
      };
      await sb.from('rp_patterns_cache').upsert({ id: 1, urge_count: urges.length, surf_count: surfs.length, generated_at: new Date().toISOString(), insights }, { onConflict: 'id' });
      return NextResponse.json(insights);
    }

    // ── Aggregates that go directly into the prompt as "evidence" ──────────
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowCounts = Array(7).fill(0);
    const timeCounts = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    let intensitySum = 0;
    const wordFreq: Record<string, number> = {};
    const tagStats: Record<string, { count: number; intensitySum: number }> = {};

    for (const u of urges) {
      const d = new Date(u.created_at);
      dowCounts[d.getDay()]++;
      const h = d.getHours();
      if (h >= 6 && h < 12) timeCounts.Morning++;
      else if (h >= 12 && h < 18) timeCounts.Afternoon++;
      else if (h >= 18 && h < 22) timeCounts.Evening++;
      else timeCounts.Night++;
      intensitySum += u.intensity;
      for (const t of (u.tags ?? [])) {
        tagStats[t] = tagStats[t] ?? { count: 0, intensitySum: 0 };
        tagStats[t].count++;
        tagStats[t].intensitySum += u.intensity;
      }
      if (u.note) {
        for (const word of u.note.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)) {
          if (word.length > 2 && !STOPWORDS.has(word)) wordFreq[word] = (wordFreq[word] ?? 0) + 1;
        }
      }
    }

    const avgIntensity = intensitySum / urges.length;
    const peakDow = DAYS[dowCounts.indexOf(Math.max(...dowCounts))];
    const peakTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0][0];
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);

    // Last 7 days vs prior 7 days
    const now = Date.now();
    const last7Cut = now - 7 * 86400000;
    const prior7Cut = now - 14 * 86400000;
    const last7Urges = urges.filter(u => new Date(u.created_at).getTime() >= last7Cut);
    const prior7Urges = urges.filter(u => { const t = new Date(u.created_at).getTime(); return t >= prior7Cut && t < last7Cut; });
    const last7Avg = last7Urges.length ? (last7Urges.reduce((s, u) => s + u.intensity, 0) / last7Urges.length).toFixed(2) : '—';
    const prior7Avg = prior7Urges.length ? (prior7Urges.reduce((s, u) => s + u.intensity, 0) / prior7Urges.length).toFixed(2) : '—';

    // Tag lines ranked by HARM (avg intensity) with a min-count guard, so the
    // prompt foregrounds tags that hurt rather than tags that just show up often.
    const tagLines = Object.entries(tagStats)
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => (b[1].intensitySum / b[1].count) - (a[1].intensitySum / a[1].count))
      .slice(0, 8)
      .map(([t, v]) => `${t}: ${v.count} urges, avg intensity ${(v.intensitySum / v.count).toFixed(2)} (vs overall ${avgIntensity.toFixed(2)})`);

    const completedSurfs = surfs.filter(s => s.full_completion).length;
    const surfRate = surfs.length ? `${completedSurfs}/${surfs.length} (${Math.round((completedSurfs / surfs.length) * 100)}%)` : 'no surf attempts logged';
    const last5Surfs = surfs.slice(-5).map(s => `${new Date(s.surfed_at).toISOString().split('T')[0]} ${s.full_completion ? 'completed' : `partial ${Math.round(s.completed_seconds / 60)}m`}`).join('; ');

    const diaryEntries = (diaryRes.data ?? []).filter((d): d is { date: string; body: string; mood: number | null } => !!(d.body as string)?.trim());
    const moodCounts = [0, 0, 0, 0, 0];
    for (const d of diaryEntries) { if (d.mood) moodCounts[d.mood - 1]++; }
    const moodLine = diaryEntries.some(d => d.mood) ? `Mood distribution last 30d: ${moodCounts.map((c, i) => `${i + 1}/5=${c}`).join(', ')}` : '';
    const diaryBlock = diaryEntries.length === 0 ? '' : `\nDIARY ENTRIES (newest first; mood 1=rough, 5=great):\n` + diaryEntries.slice(0, 14).map(d => {
      const m = d.mood ? ` [mood ${d.mood}/5]` : '';
      const trimmed = d.body.trim().replace(/\s+/g, ' ').slice(0, 320);
      return `- ${d.date}${m}: "${trimmed}${d.body.length > 320 ? '…' : ''}"`;
    }).join('\n');

    const plan = (planRes.data ?? { triggers: '', warning_signs: '', replacement_behaviors: '', why: '' }) as { triggers: string; warning_signs: string; replacement_behaviors: string; why: string };
    const planBlock = `
EXISTING RELAPSE PREVENTION PLAN (do not duplicate what's already there):
- Triggers: ${plan.triggers || '(empty)'}
- Warning signs: ${plan.warning_signs || '(empty)'}
- Replacement behaviors: ${plan.replacement_behaviors || '(empty)'}
- Why: ${plan.why || '(empty)'}`;

    const prompt = `Recovery data for someone${streakDays !== null ? ` on day ${streakDays} of sobriety` : ''}:

URGE TOTALS
- Logged: ${urges.length}; overall avg intensity ${avgIntensity.toFixed(2)}/5
- Last 7d: ${last7Urges.length} urges, avg ${last7Avg}
- Prior 7d: ${prior7Urges.length} urges, avg ${prior7Avg}
- Peak day: ${peakDow}; Peak time bucket: ${peakTime}
- Day-of-week counts: ${DAYS.map((d, i) => `${d} ${dowCounts[i]}`).join(', ')}
- Time-of-day counts: Morning ${timeCounts.Morning}, Afternoon ${timeCounts.Afternoon}, Evening ${timeCounts.Evening}, Night ${timeCounts.Night}

TAG IMPACT (ranked by avg intensity, min 2 occurrences — these are the tags doing the most harm)
${tagLines.length ? tagLines.map(l => `- ${l}`).join('\n') : '- (no tags logged yet)'}

URGE SURF SUCCESS
- Full completion rate: ${surfRate}
- Last 5 attempts: ${last5Surfs || '(none)'}

NOTE THEMES: ${topWords.length ? topWords.join(', ') : '(no notes recorded)'}
${moodLine ? moodLine + '\n' : ''}${diaryBlock}
${planBlock}

Return JSON with this exact shape:
{
  "observations": [
    {"headline": "≤7 word title", "detail": "1–2 sentence specific observation grounded in the numbers above. Cite the actual numbers. Reference a specific date if relevant.", "reference": "optional ISO date like 2026-06-08"}
  ],
  "plan_suggestions": [
    {"field": "triggers" | "warning_signs" | "replacement_behaviors", "text": "one concrete line to append to that section of the RP plan"}
  ],
  "crisis_line": "one calm sentence (≤20 words) that will be shown to the user the next time they open crisis mode, grounded in their recent pattern; reassuring not preachy; no quotes from diary"
}

Rules:
- Produce 2–3 observations. They must be SPECIFIC and grounded in the data (cite numbers like "Tired urges average 4.2/5 vs your overall 2.8/5" or "you logged 4 urges this Tuesday between 9pm–11pm"). Skip generic platitudes.
- Produce 1–3 plan_suggestions. Each one must be a single concrete line that the user could literally paste into the named field. Do NOT duplicate text that is already in that field of the existing plan above.
- The crisis_line is read at peak distress. Keep it grounded ("you've surfed this Sunday-evening pattern before — same playbook"), short, never preachy, never religious unless data clearly invites it.
- If sobriety streak is high and the recent trend looks good, surface that as one observation — momentum matters.
- The user is Muslim. At most one suggestion may draw on Islamic practice (dhikr/wudu/salah), only if it actually fits the pattern; never make it the only suggestion.
- No quotes longer than 8 words from diary entries.
- Compact JSON only.`;

    const raw = await callAI(prompt, 'You are a recovery coach analyzing this user\'s personal log. Be specific, data-driven, and compassionate. Output compact JSON only.', 900);
    const insights = parseJSON<Insights>(raw);

    await sb.from('rp_patterns_cache').upsert({
      id: 1,
      urge_count: urges.length,
      surf_count: surfs.length,
      generated_at: new Date().toISOString(),
      insights,
    }, { onConflict: 'id' });

    return NextResponse.json(insights);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[recovery-patterns] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
