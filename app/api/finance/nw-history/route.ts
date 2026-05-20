import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET() {
  const sb = supabaseServer();
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const { data, error } = await sb
    .from('finance_nw_history')
    .select('total, snapshot_date')
    .gte('snapshot_date', since.toISOString().split('T')[0])
    .order('snapshot_date');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { total } = await req.json() as { total: number };
  const sb = supabaseServer();
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb
    .from('finance_nw_history')
    .upsert({ total, snapshot_date: today }, { onConflict: 'snapshot_date' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
