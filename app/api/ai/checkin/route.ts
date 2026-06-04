import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI } from '@/lib/ai';

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

export async function POST(req: NextRequest) {
  const { days, recentUrges } = await req.json();
  if (!process.env.GOOGLE_API_KEY)
    return NextResponse.json({ error: 'no_key' }, { status: 503 });

  const urgeSummary = recentUrges?.length
    ? recentUrges.map((u: { intensity: number; note: string }) => `Intensity ${u.intensity}${u.note ? ': ' + u.note : ''}`).join('; ')
    : 'No recent urges logged';

  // Pull last 7 days of diary entries server-side. Gives the check-in
  // the qualitative texture the urge log lacks (mood, sleep, daily events,
  // near-misses, what's been working).
  const sb = supabaseServer();
  const today = toDateStr(new Date());
  const sevenAgo = toDateStr(new Date(Date.now() - 7 * 86400000));
  const { data: diaryRows } = await sb
    .from('diary_entries')
    .select('date, body, mood')
    .gte('date', sevenAgo)
    .lte('date', today)
    .order('date', { ascending: false });

  const diaryEntries = (diaryRows ?? []).filter((d): d is { date: string; body: string; mood: number | null } => !!(d.body as string)?.trim());
  const diaryBlock = diaryEntries.length === 0
    ? ''
    : `\nRecent diary (newest first; mood 1=rough, 5=great):\n` + diaryEntries.map(d => {
        const m = d.mood ? ` [mood ${d.mood}/5]` : '';
        const trimmed = d.body.trim().replace(/\s+/g, ' ').slice(0, 360);
        return `- ${d.date}${m}: "${trimmed}${d.body.length > 360 ? '…' : ''}"`;
      }).join('\n');

  try {
    const text = await callAI(
      `I'm on day ${days} of my recovery journey. Recent urges: ${urgeSummary}.${diaryBlock}\n\nGive me a warm, personal 2-3 paragraph encouragement and one concrete coping suggestion for right now.`,
      'You are a compassionate recovery coach. Be genuine, specific, and warm. Acknowledge the exact streak, validate the struggle, and offer practical hope. Never be preachy or generic. The user is Muslim. Where it truly fits, acknowledge their faith — the Islamic value of sabr in hardship, or that dua (supplication) is a powerful resource. Only where it genuinely fits, never forced. If "Recent diary" entries are provided, briefly reflect something the user actually wrote (a worry, a small win, a near-miss, a feeling) into the encouragement — without quoting large passages, and only when it flows naturally. This makes the message feel personally seen rather than generic.',
      1200,
    );
    return NextResponse.json({ message: text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
