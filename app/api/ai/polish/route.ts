import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseJSON } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  if (!process.env.GOOGLE_API_KEY)
    return NextResponse.json({ polished: text, fallback: true });
  try {
    const raw = await callAI(
      `Clean up the following goal into a single, clear, action-oriented task. Return only a JSON array containing exactly one string. No preamble, no code fences.\n\nGoal: "${text}"`,
    );
    const arr = parseJSON<string[]>(raw);
    const polished = Array.isArray(arr) ? arr[0] : text;
    return NextResponse.json({ polished });
  } catch {
    return NextResponse.json({ polished: text, fallback: true });
  }
}
