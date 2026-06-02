import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAIChatStream, type ChatMessage } from '@/lib/ai';
import { buildCoachContext } from '@/lib/coach-context';

export const maxDuration = 60;

const SYSTEM_PROMPT_BASE = `You are the user's personal coach inside a self-tracking app. The user is Muslim and you may reference Islamic values (sabr, istiqama, dhikr, salah, alhamdulillah) where it flows naturally — never preachy, never forced, at most one reference per response.

HARD RULES (enforced strictly):
1. Use ONLY numbers shown in the USER DATA SNAPSHOT below. Never state X/Y where X > Y. Never compute new ratios or invent figures. If you don't have a specific number, say so.
2. Every answer that recommends an action must reference at least one specific piece of data AND propose one concrete next step. Vague encouragement is rejected.
3. BANNED filler phrases: "great foundation", "spiritual anchor", "commendable", "keep nurturing", "small consistent steps", "wonderful work", "amazing job", "renewed focus", "let's focus on", "stay strong", "you've got this".
4. Keep replies tight — usually 1–3 short paragraphs. Long lists only when the user explicitly asks for a plan.
5. If the user asks a question the data doesn't answer (e.g. something you'd need a missing log for), say what you don't know — don't fabricate.
6. The user may discuss recovery, urges, or relapses. Be compassionate and direct; never minimize, never push harder when they're already struggling.
7. The cross-domain patterns are observed associations, not proven causes. Phrase them that way.`;

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const { messages } = await req.json() as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }
    // Last message must be from the user.
    const last = messages[messages.length - 1];
    if (last.role !== 'user' || !last.content?.trim()) {
      return NextResponse.json({ error: 'last message must be a non-empty user message' }, { status: 400 });
    }

    const sb = supabaseServer();
    const context = await buildCoachContext(sb);
    const system = `${SYSTEM_PROMPT_BASE}\n\n${context}`;

    // Cap context window: send the last 20 messages so a long conversation
    // doesn't run away with tokens. (System + data are always fresh anyway.)
    // Gemini also requires conversations to start with a user turn — walk
    // forward to the next user message if the slice cut mid-pair.
    const sliced = messages.slice(-20);
    const startIdx = sliced.findIndex(m => m.role === 'user');
    const recent = startIdx >= 0 ? sliced.slice(startIdx) : sliced;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of callAIChatStream(recent, system, 1200, req.signal)) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (e) {
          if ((e as Error).name === 'AbortError') {
            // Client went away — close cleanly, no error in payload.
            controller.close();
            return;
          }
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[chat] stream error:', msg);
          controller.enqueue(encoder.encode(`\n\n[error] ${msg}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Content-Type-Options': 'nosniff',
        // Disable Next.js / proxy buffering so chunks reach the browser as they arrive.
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[chat] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
