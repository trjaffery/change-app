// Primary + fallback. Both must be current Google models — gemini-2.0-flash was
// deprecated in early 2026, so 2.5-flash-lite is now the lightweight fallback.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

async function callModel(model: string, body: Record<string, unknown>): Promise<Response> {
  const key = process.env.GOOGLE_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export async function callAI(
  userPrompt: string,
  systemPrompt = '',
  maxTokens = 1000,
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  let res: Response | null = null;
  for (const model of MODELS) {
    res = await callModel(model, body);
    if (res.status !== 503) break;
  }

  if (!res!.ok) {
    const err = await res!.text();
    throw new Error(`Gemini ${res!.status}: ${err}`);
  }

  const data = await res!.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export function parseJSON<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned) as T;
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

// Multi-turn version of callAI for the coach chat. Gemini uses "model" instead of
// "assistant" for the AI side, so we map on the way in.
export async function callAIChat(
  messages: ChatMessage[],
  systemPrompt = '',
  maxTokens = 1000,
): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  let res: Response | null = null;
  for (const model of MODELS) {
    res = await callModel(model, body);
    if (res.status !== 503) break;
  }

  if (!res!.ok) {
    const err = await res!.text();
    throw new Error(`Gemini ${res!.status}: ${err}`);
  }

  const data = await res!.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// Streaming variant — yields text deltas as Gemini produces them. Used by the coach chat.
// Uses :streamGenerateContent with alt=sse so each event is a clean `data: {…}` line.
export async function* callAIChatStream(
  messages: ChatMessage[],
  systemPrompt = '',
  maxTokens = 1200,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const key = process.env.GOOGLE_API_KEY!;
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  let res: Response | null = null;
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${key}&alt=sse`;
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (res.status !== 503) break;
  }

  if (!res!.ok) {
    const err = await res!.text();
    throw new Error(`Gemini ${res!.status}: ${err}`);
  }

  const reader = res!.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE parser — split on \n, take `data: …` lines, JSON.parse, extract the text part.
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const data = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch { /* skip malformed chunk */ }
    }
  }
}
