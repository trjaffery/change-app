const MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash'];

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
