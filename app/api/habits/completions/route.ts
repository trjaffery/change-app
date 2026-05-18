import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { habit_id, date } = await req.json();
  if (!habit_id || !date) return NextResponse.json({ error: 'habit_id and date required' }, { status: 400 });

  const { data: existing } = await sb
    .from('habit_completions')
    .select('id, count')
    .eq('habit_id', habit_id)
    .eq('date', date)
    .single();

  if (existing) {
    const { data, error } = await sb
      .from('habit_completions')
      .update({ count: existing.count + 1 })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } else {
    const { data, error } = await sb
      .from('habit_completions')
      .insert({ habit_id, date, count: 1 })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }
}

export async function DELETE(req: NextRequest) {
  const sb = supabaseServer();
  const { habit_id, date } = await req.json();
  if (!habit_id || !date) return NextResponse.json({ error: 'habit_id and date required' }, { status: 400 });

  const { data: existing } = await sb
    .from('habit_completions')
    .select('id, count')
    .eq('habit_id', habit_id)
    .eq('date', date)
    .single();

  if (!existing) return new NextResponse(null, { status: 204 });

  if (existing.count <= 1) {
    await sb.from('habit_completions').delete().eq('id', existing.id);
  } else {
    await sb.from('habit_completions')
      .update({ count: existing.count - 1 })
      .eq('id', existing.id);
  }
  return new NextResponse(null, { status: 204 });
}
