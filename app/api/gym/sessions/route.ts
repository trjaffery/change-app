import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { split_day_id, date } = await req.json();
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  const { data, error } = await sb
    .from('gym_sessions')
    .insert({ split_day_id: split_day_id ?? null, date, started_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('gym_sessions')
    .select('*, split_days(name, splits(name))')
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
