import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseJSON } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { exercise, sessions } = await req.json();
  if (!exercise || !sessions?.length)
    return NextResponse.json({ error: 'exercise and sessions required' }, { status: 400 });
  if (!process.env.GOOGLE_API_KEY)
    return NextResponse.json({ error: 'no_key' }, { status: 503 });

  const sessionDesc = sessions.map((s: { date: string; sets: { reps: number; weight: number }[] }, i: number) => {
    const setsDesc = s.sets.map((st: { reps: number; weight: number }) => `${st.reps} reps @ ${st.weight}lbs`).join(', ');
    return `Session ${i + 1} (${s.date}): ${setsDesc}`;
  }).join('\n');

  try {
    const text = await callAI(
      `Exercise: ${exercise}\nLast ${sessions.length} sessions:\n${sessionDesc}\n\nBased on this history, recommend next session targets. Return ONLY valid JSON with no markdown fences:\n{"sets": number, "reps": number, "weight": number, "notes": "brief coaching note"}`,
      'You are a personal trainer. Respond with compact JSON only — no markdown, no extra text.',
      300,
    );
    const json = parseJSON<{ sets: number; reps: number; weight: number; notes: string }>(text);
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
