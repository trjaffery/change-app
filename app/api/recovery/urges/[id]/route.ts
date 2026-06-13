import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer();
  const { error } = await sb.from('recovery_urges').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

// PATCH /api/recovery/urges/[id] { intensity?, note?, tags?, is_crisis? }
// Partial update; only writes fields the body actually included.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.intensity === 'number' && body.intensity >= 1 && body.intensity <= 5) update.intensity = body.intensity;
  if (typeof body.note === 'string') update.note = body.note;
  if (Array.isArray(body.tags)) {
    update.tags = body.tags
      .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t: string) => t.trim());
  }
  if (typeof body.is_crisis === 'boolean') update.is_crisis = body.is_crisis;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'no editable fields' }, { status: 400 });
  const sb = supabaseServer();
  const { data, error } = await sb.from('recovery_urges').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
