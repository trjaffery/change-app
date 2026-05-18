import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  const db = supabaseServer();
  const { data, error } = await db.from('goals').select('*').eq('date', date).order('position');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, text, position } = body;
  if (!date || !text) return NextResponse.json({ error: 'date and text required' }, { status: 400 });
  const db = supabaseServer();
  const { data, error } = await db.from('goals').insert({ date, text, position: position ?? 0 }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
