import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  const db = supabaseServer();
  // created_at tiebreaker: position is 0 for everything logged via the app,
  // so without it row order (and drop-set grouping) is nondeterministic.
  let query = db.from('gym_sets').select('*').order('exercise').order('position').order('created_at');
  if (date) query = query.eq('date', date);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, exercise, reps, weight, parent_set_id } = body;
  if (!date || !exercise || reps == null || weight == null)
    return NextResponse.json({ error: 'date, exercise, reps, weight required' }, { status: 400 });
  const db = supabaseServer();
  // Only include parent_set_id when set (drop sets) so plain logging keeps
  // working even before the schema migration adds the column.
  const row: Record<string, unknown> = { date, exercise, reps, weight };
  if (parent_set_id) row.parent_set_id = parent_set_id;
  const { data, error } = await db.from('gym_sets').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
