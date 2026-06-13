import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/recovery/urges?limit=10&offset=0
//   - Defaults: limit=100, offset=0 (matches the old hard cap so existing
//     callers keep working unchanged).
//   - Returns the rows as a plain JSON array.
//   - Sets `X-Total-Count` so paginated callers can show "X of N" without
//     a second roundtrip.
export async function GET(req: NextRequest) {
  const db = supabaseServer();
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') ?? 100)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  const { data, count, error } = await db
    .from('recovery_urges')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json(data ?? []);
  res.headers.set('X-Total-Count', String(count ?? 0));
  return res;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.intensity) return NextResponse.json({ error: 'intensity required' }, { status: 400 });
  // Accept either `tags` (new) or legacy `triggers`/`halt` and merge them. Legacy
  // halt codes are expanded to their full labels so historic callers still work.
  const HALT_LABEL: Record<string, string> = { H: 'Hungry', A: 'Angry', L: 'Lonely', T: 'Tired' };
  const tags = new Set<string>();
  for (const t of (Array.isArray(body.tags) ? body.tags : [])) if (typeof t === 'string' && t.trim()) tags.add(t.trim());
  for (const t of (Array.isArray(body.triggers) ? body.triggers : [])) if (typeof t === 'string' && t.trim()) tags.add(t.trim());
  for (const c of (Array.isArray(body.halt) ? body.halt : [])) if (typeof c === 'string' && HALT_LABEL[c]) tags.add(HALT_LABEL[c]);

  const db = supabaseServer();
  const { data, error } = await db.from('recovery_urges').insert({
    intensity: Number(body.intensity),
    note: body.note ?? '',
    tags: [...tags],
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
