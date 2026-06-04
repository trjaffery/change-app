import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/diary?limit=N&offset=M
//   Returns entries newest first. Sets X-Total-Count header.
export async function GET(req: NextRequest) {
  const db = supabaseServer();
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') ?? 20)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  const { data, count, error } = await db
    .from('diary_entries')
    .select('date, body, mood, updated_at', { count: 'exact' })
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json(data ?? []);
  res.headers.set('X-Total-Count', String(count ?? 0));
  return res;
}
