import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: split_id } = await params;
  const sb = supabaseServer();
  const { name, day_of_week } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data: last } = await sb
    .from('split_days')
    .select('position')
    .eq('split_id', split_id)
    .order('position', { ascending: false })
    .limit(1);
  const position = (last?.[0]?.position ?? -1) + 1;

  const { data, error } = await sb
    .from('split_days')
    .insert({ split_id, name, day_of_week: day_of_week ?? null, position })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
