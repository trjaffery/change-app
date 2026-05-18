import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET() {
  const sb = supabaseServer();
  const { data: splits, error } = await sb
    .from('splits')
    .select('*, split_days(*, split_exercises(*))')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Sort nested arrays by position
  const sorted = (splits ?? []).map(s => ({
    ...s,
    split_days: (s.split_days ?? [])
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
      .map((d: { split_exercises: { position: number }[] }) => ({
        ...d,
        split_exercises: (d.split_exercises ?? []).sort((a, b) => a.position - b.position),
      })),
  }));
  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const { data, error } = await sb.from('splits').insert({ name }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
