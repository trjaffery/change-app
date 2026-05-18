import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const db = supabaseServer();
  let query = db.from('recovery_settings').select('*');
  if (key) query = query.eq('key', key);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Return as {key: value} map
  const map: Record<string, string> = {};
  for (const row of data) map[row.key] = row.value;
  return NextResponse.json(map);
}

export async function PUT(req: NextRequest) {
  const { key, value } = await req.json();
  if (!key || value == null) return NextResponse.json({ error: 'key and value required' }, { status: 400 });
  const db = supabaseServer();
  const { error } = await db
    .from('recovery_settings')
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ key, value });
}
