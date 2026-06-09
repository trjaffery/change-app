import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai';

export const maxDuration = 30;

// POST /api/ai/play-the-tape { situation: string }
//   The "play the tape through" CBT exercise: AI walks the user through a
//   realistic next-24-hours playthrough of acting on the urge.
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const { situation } = await req.json();
    if (typeof situation !== 'string' || !situation.trim()) {
      return NextResponse.json({ error: 'situation required' }, { status: 400 });
    }

    const prompt = `Situation right now: "${situation.trim()}"

Walk me through, hour by hour, what the realistic next 24 hours look like if I act on this urge. Be specific, not preachy. Include: the immediate moment after acting on it, the shame/regret hours later, the morning, the lost streak, the conversation I would not be able to have honestly, the small ways the day after would be diminished. End with one sentence on what's still here if I don't act on it.`;

    const text = await callAI(
      prompt,
      'You are a recovery coach using the "play the tape through" CBT technique. Be brutally specific and concrete — name actual hours, actual feelings, actual consequences. Never preachy, never generic. No banned filler ("great foundation", "stay strong", "you got this"). 4-6 short paragraphs max. The user is Muslim — where it genuinely fits (e.g. fajr the next morning, the conversation in dua, the loss of istiqama momentum), weave that in briefly. At most one Islamic reference, never forced. End with one short hopeful sentence about not acting on it.',
      900,
    );
    return NextResponse.json({ message: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[play-the-tape] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
