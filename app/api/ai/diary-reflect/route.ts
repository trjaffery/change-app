import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseJSON } from '@/lib/ai';

interface ReflectionResponse { question: string | null }

/**
 * POST { date, body, mood? } — return one short reflection question that picks
 * at a thing the entry doesn't yet examine. Returns { question: null } for
 * entries that don't have enough material (< 40 words) so the UI hides quietly.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const { date, body, mood } = await req.json() as { date: string; body: string; mood: number | null };
    const wordCount = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 40) return NextResponse.json({ question: null } satisfies ReflectionResponse);

    const moodLine = mood ? ` Mood tagged ${mood}/5.` : '';
    const prompt = `Diary entry from ${date}.${moodLine}

"""
${body.trim().slice(0, 2400)}
"""

Write ONE short question (≤15 words) that picks at a specific thing this entry mentions but doesn't yet examine. Examples of good shapes:
- "What does the moment with [specific thing] usually do to your mood the next day?"
- "When you say [exact phrase used], what would the opposite look like?"
- "What would changing [specific X] cost you?"

Rules:
- The question must reference something specific from the entry (a person, place, feeling, action, phrase).
- Not therapeutic or generic ("How are you feeling?" is rejected).
- Not preachy or judgmental.
- Output compact JSON only: {"question":"…"}`;

    const raw = await callAI(prompt, 'You write one short, specific reflection question on a diary entry. Picks at something the entry didn\'t yet examine. Compact JSON only.', 150);
    const parsed = parseJSON<ReflectionResponse>(raw);
    return NextResponse.json({ question: parsed.question?.trim() || null } satisfies ReflectionResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[diary-reflect] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
