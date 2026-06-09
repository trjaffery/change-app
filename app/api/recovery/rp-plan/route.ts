import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/recovery/rp-plan → the single row, or seeded defaults if missing.
export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from('rp_plan').select('*').eq('id', 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { id: 1, triggers: '', warning_signs: '', replacement_behaviors: '', support_people: [], why: '' });
}

// PUT /api/recovery/rp-plan { triggers?, warning_signs?, replacement_behaviors?, support_people?, why? }
// Upsert by id=1. Mirrors diary auto-save pattern.
export async function PUT(req: NextRequest) {
  const sb = supabaseServer();
  const body = await req.json();
  const update: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  for (const k of ['triggers', 'warning_signs', 'replacement_behaviors', 'why']) {
    if (k in body) update[k] = String(body[k] ?? '');
  }
  if ('support_people' in body) update.support_people = body.support_people ?? [];
  const { data, error } = await sb
    .from('rp_plan')
    .upsert(update, { onConflict: 'id' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
