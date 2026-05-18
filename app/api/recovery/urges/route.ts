import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET() {
  const db = supabaseServer();
  const { data, error } = await db.from('recovery_urges').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { intensity, note } = await req.json();
  if (!intensity) return NextResponse.json({ error: 'intensity required' }, { status: 400 });
  const db = supabaseServer();
  const { data, error } = await db.from('recovery_urges').insert({ intensity: Number(intensity), note: note ?? '' }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
