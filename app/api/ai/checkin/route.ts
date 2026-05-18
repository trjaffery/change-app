import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { days, recentUrges } = await req.json();
  if (!process.env.GOOGLE_API_KEY)
    return NextResponse.json({ error: 'no_key' }, { status: 503 });

  const urgeSummary = recentUrges?.length
    ? recentUrges.map((u: { intensity: number; note: string }) => `Intensity ${u.intensity}${u.note ? ': ' + u.note : ''}`).join('; ')
    : 'No recent urges logged';

  try {
    const text = await callAI(
      `I'm on day ${days} of my recovery journey. Recent urges: ${urgeSummary}. Give me a warm, personal 2-3 paragraph encouragement and one concrete coping suggestion for right now.`,
      'You are a compassionate recovery coach. Be genuine, specific, and warm. Acknowledge the exact streak, validate the struggle, and offer practical hope. Never be preachy or generic.',
      1200,
    );
    return NextResponse.json({ message: text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
