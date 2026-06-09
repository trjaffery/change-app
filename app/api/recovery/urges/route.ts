import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/recovery/urges?limit=10&offset=0
//   - Defaults: limit=100, offset=0 (matches the old hard cap so existing
//     callers — CheckIn, UrgePatterns — keep working unchanged).
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
  const { intensity, note, triggers, halt } = await req.json();
  if (!intensity) return NextResponse.json({ error: 'intensity required' }, { status: 400 });
  const db = supabaseServer();
  const { data, error } = await db.from('recovery_urges').insert({
    intensity: Number(intensity),
    note: note ?? '',
    triggers: triggers ?? [],
    halt: Array.isArray(halt) ? halt : [],
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
