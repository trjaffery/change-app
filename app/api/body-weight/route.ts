import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/body-weight?days=60  → recent body_weight rows ascending
export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const days = Math.max(7, Math.min(365, Number(req.nextUrl.searchParams.get('days') ?? 90)));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const { data, error } = await sb
    .from('body_weight')
    .select('date, weight')
    .gte('date', sinceStr)
    .order('date', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST { date, weight } → upsert. One row per day, latest write wins.
export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { date, weight } = await req.json();
  if (!date || typeof weight !== 'number' || weight <= 0) {
    return NextResponse.json({ error: 'date and positive weight required' }, { status: 400 });
  }
  const { data, error } = await sb
    .from('body_weight')
    .upsert({ date, weight, updated_at: new Date().toISOString() }, { onConflict: 'date' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
