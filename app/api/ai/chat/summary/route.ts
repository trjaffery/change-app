import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI } from '@/lib/ai';

/**
 * Phase 3 #18: After each completed chat turn, the client posts the latest
 * user message + assistant reply. We use a small Gemini call to produce a 1–2
 * sentence "current focus" and upsert it into coach_session_state.
 *
 * The next chat turn reads that summary into its system prompt, so the user
 * can have a long conversation without the 20-message truncation losing
 * the running thread.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ skipped: true });

  try {
    const { user, assistant } = await req.json() as { user: string; assistant: string };
    if (!user?.trim() || !assistant?.trim()) {
      return NextResponse.json({ error: 'user + assistant required' }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data: state } = await sb.from('coach_session_state').select('summary').eq('id', 1).maybeSingle();
    const prev = state?.summary?.trim() ?? '';

    const prompt = `Existing running summary of this coach conversation (may be empty):
"${prev}"

The latest exchange:
USER: ${user.trim().slice(0, 600)}
ASSISTANT: ${assistant.trim().slice(0, 1200)}

Produce a single 1–2 sentence summary of the CURRENT FOCUS of this ongoing conversation (≤40 words). It should capture what the user is working on right now and what was just decided/asked, in third person, no preamble. Compact text only.`;

    const summary = (await callAI(prompt, 'You write a tight running summary of a coach chat. Output is a single 1–2 sentence string, no JSON, no quotes.', 200)).trim();

    await sb.from('coach_session_state').upsert({
      id: 1,
      summary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return NextResponse.json({ summary });
  } catch (e) {
    console.error('[chat/summary] error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
