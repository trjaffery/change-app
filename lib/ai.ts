import { GoogleGenAI } from '@google/genai';

function getClient() {
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
}

export async function callAI(
  userPrompt: string,
  systemPrompt = '',
  maxTokens = 1000,
): Promise<string> {
  const response = await getClient().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userPrompt,
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return response.text ?? '';
}

export function parseJSON<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned) as T;
}
