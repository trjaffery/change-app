import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  const db = supabaseServer();
  let query = db.from('gym_sets').select('*').order('exercise').order('position');
  if (date) query = query.eq('date', date);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, exercise, reps, weight } = body;
  if (!date || !exercise || reps == null || weight == null)
    return NextResponse.json({ error: 'date, exercise, reps, weight required' }, { status: 400 });
  const db = supabaseServer();
  const { data, error } = await db.from('gym_sets').insert({ date, exercise, reps, weight }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
