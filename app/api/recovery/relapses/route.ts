import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { toDateString } from '@/lib/dates';

export async function GET() {
  const db = supabaseServer();
  const { data, error } = await db.from('recovery_relapses').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { note } = await req.json();
  const db = supabaseServer();
  // Insert relapse record
  const { data, error } = await db.from('recovery_relapses').insert({ note: note ?? '' }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Reset sobriety start to today
  await db.from('recovery_settings').upsert({
    key: 'sobriety_start',
    value: toDateString(new Date()),
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json(data, { status: 201 });
}
