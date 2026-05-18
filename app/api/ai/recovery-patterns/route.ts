import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI, parseJSON } from '@/lib/ai';

const STOPWORDS = new Set(['i', 'a', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'it', 'was', 'is', 'my', 'me', 'had', 'at', 'so', 'just', 'an', 'for', 'on', 'with', 'that', 'this', 'felt', 'feel']);

interface PatternsResponse { riskFactors: string[]; timePatterns: string[]; copingStrategies: string[] }

export async function POST() {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  const sb = supabaseServer();
  const [urgesRes, settingsRes] = await Promise.all([
    sb.from('recovery_urges').select('intensity, note, created_at').order('created_at', { ascending: true }),
    sb.from('recovery_settings').select('key, value'),
  ]);

  const urges = urgesRes.data ?? [];
  if (urges.length < 3) return NextResponse.json({ riskFactors: ['Not enough urge data yet — log more urges to see patterns'], timePatterns: [], copingStrategies: [] });

  const settings: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
  const streakDays = settings['sobriety_start']
    ? Math.floor((Date.now() - new Date(settings['sobriety_start']).getTime()) / 86400000)
    : null;

  // Day-of-week counts
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowCounts = Array(7).fill(0);
  const timeCounts = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  let intensitySum = 0;
  const wordFreq: Record<string, number> = {};

  for (const u of urges) {
    const d = new Date(u.created_at);
    dowCounts[d.getDay()]++;
    const h = d.getHours();
    if (h >= 6 && h < 12) timeCounts.Morning++;
    else if (h >= 12 && h < 18) timeCounts.Afternoon++;
    else if (h >= 18 && h < 22) timeCounts.Evening++;
    else timeCounts.Night++;
    intensitySum += u.intensity;

    if (u.note) {
      for (const word of u.note.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)) {
        if (word.length > 2 && !STOPWORDS.has(word)) wordFreq[word] = (wordFreq[word] ?? 0) + 1;
      }
    }
  }

  const avgIntensity = (intensitySum / urges.length).toFixed(1);
  const peakDow = DAYS[dowCounts.indexOf(Math.max(...dowCounts))];
  const peakTime = (Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0][0]);
  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);

  // Intensity trend: compare first half vs second half
  const half = Math.floor(urges.length / 2);
  const firstHalfAvg = urges.slice(0, half).reduce((s, u) => s + u.intensity, 0) / half;
  const secondHalfAvg = urges.slice(half).reduce((s, u) => s + u.intensity, 0) / (urges.length - half);
  const trend = secondHalfAvg > firstHalfAvg + 0.3 ? 'increasing' : secondHalfAvg < firstHalfAvg - 0.3 ? 'decreasing' : 'stable';

  const prompt = `Recovery data for someone with ${streakDays !== null ? `${streakDays} days sober` : 'an ongoing recovery journey'}:
- Total urges logged: ${urges.length}
- Average urge intensity: ${avgIntensity}/5 (trend: ${trend})
- Peak urge day: ${peakDow} (${dowCounts[DAYS.indexOf(peakDow)]} urges)
- Peak urge time: ${peakTime} (${timeCounts[peakTime as keyof typeof timeCounts]} urges)
- Time breakdown: Morning ${timeCounts.Morning}, Afternoon ${timeCounts.Afternoon}, Evening ${timeCounts.Evening}, Night ${timeCounts.Night}
- Common themes in urge notes: ${topWords.length ? topWords.join(', ') : 'no notes recorded'}

Return JSON with this exact shape:
{"riskFactors":["2-3 specific risk factors based on their data"],"timePatterns":["2-3 observations about their timing patterns"],"copingStrategies":["3-4 concrete strategies tailored to their specific patterns"]}`;

  const raw = await callAI(prompt, 'You are a recovery coach. Be specific, compassionate, and data-driven. Respond with compact JSON only.', 900);
  const result = parseJSON<PatternsResponse>(raw);

  return NextResponse.json(result);
}
