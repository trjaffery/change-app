import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai';

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'no_key' }, { status: 503 });

  const { exercise, sessions } = await req.json() as {
    exercise: string;
    sessions: { date: string; maxWeight: number }[];
  };

  if (!exercise || !sessions?.length) {
    return NextResponse.json({ error: 'exercise and sessions required' }, { status: 400 });
  }

  const sessionList = sessions.map(s => `${s.date.slice(5)}: ${s.maxWeight}lb`).join(' → ');

  const prompt = `Exercise: ${exercise}
Last ${sessions.length} sessions: ${sessionList}
No meaningful weight increase over these sessions. Give one specific, actionable recommendation to break the plateau — deload week, rep scheme change (e.g. 5x5 → 3x8), exercise variation, or a technique cue. 2 sentences max.`;

  try {
    const suggestion = await callAI(
      prompt,
      'You are a strength coach. Be direct and specific. Plain text only — no markdown, no intro phrases like "Great job" or "I can see".',
      200,
    );
    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
