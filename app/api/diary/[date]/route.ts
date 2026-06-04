import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/diary/[date] → the single entry for that date (null if not yet written)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const db = supabaseServer();
  const { data, error } = await db
    .from('diary_entries')
    .select('date, body, mood, updated_at')
    .eq('date', date)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT /api/diary/[date] body: { body: string, mood?: number|null }
//   Upsert by date.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const { body, mood } = await req.json();
  if (typeof body !== 'string') return NextResponse.json({ error: 'body string required' }, { status: 400 });
  const safeMood = (mood === null || mood === undefined) ? null : Math.max(1, Math.min(5, Number(mood)));

  const db = supabaseServer();
  const { data, error } = await db
    .from('diary_entries')
    .upsert(
      { date, body, mood: safeMood, updated_at: new Date().toISOString() },
      { onConflict: 'date' },
    )
    .select('date, body, mood, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/diary/[date] — remove the entry entirely.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const db = supabaseServer();
  const { error } = await db.from('diary_entries').delete().eq('date', date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
