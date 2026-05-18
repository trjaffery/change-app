import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/gym/exercises — unique exercise names, sorted
export async function GET() {
  const db = supabaseServer();
  const { data, error } = await db.from('gym_sets').select('exercise');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const names = [...new Set(data.map(r => r.exercise))].sort();
  return NextResponse.json(names);
}
