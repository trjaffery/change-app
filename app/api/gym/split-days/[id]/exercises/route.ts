import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: split_day_id } = await params;
  const sb = supabaseServer();
  const { exercise, target_sets, target_reps, body_part } = await req.json();
  if (!exercise) return NextResponse.json({ error: 'exercise required' }, { status: 400 });

  const { data: last } = await sb
    .from('split_exercises')
    .select('position')
    .eq('split_day_id', split_day_id)
    .order('position', { ascending: false })
    .limit(1);
  const position = (last?.[0]?.position ?? -1) + 1;

  const { data, error } = await sb
    .from('split_exercises')
    .insert({ split_day_id, exercise, target_sets: target_sets ?? 3, target_reps: target_reps ?? '8', body_part: body_part || null, position })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
