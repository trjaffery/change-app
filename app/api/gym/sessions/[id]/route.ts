import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer();
  const body = await req.json();
  const { data, error } = await sb.from('gym_sessions').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer();

  // Look up the session to get its date so we can also delete that day's sets
  const { data: session, error: fetchErr } = await sb
    .from('gym_sessions').select('date').eq('id', id).single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const [setsRes, sessionRes] = await Promise.all([
    sb.from('gym_sets').delete().eq('date', session.date),
    sb.from('gym_sessions').delete().eq('id', id),
  ]);

  if (setsRes.error) return NextResponse.json({ error: setsRes.error.message }, { status: 500 });
  if (sessionRes.error) return NextResponse.json({ error: sessionRes.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
