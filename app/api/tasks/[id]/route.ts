import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { nextOccurrence } from '@/lib/recurrence';
import { getActiveDateString } from '@/lib/dates';

/**
 * PATCH /api/tasks/[id]
 *   Generic field update. Special case: when `done: true` is set on a
 *   recurring task, instead of marking it done we advance its `due_date`
 *   to the next occurrence and leave done=false. The user perceives this
 *   as "checked off → reappears on the next day it's due."
 *
 * DELETE /api/tasks/[id]
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer();
  const body = await req.json() as Record<string, unknown>;

  // If this is a "done" toggle and the task has a recurrence, advance instead.
  if (body.done === true) {
    const { data: existing } = await sb.from('tasks').select('recurrence, due_date').eq('id', id).maybeSingle();
    if (existing?.recurrence) {
      const anchor = (existing.due_date as string | null) ?? getActiveDateString();
      const next = nextOccurrence(existing.recurrence as string, anchor);
      const patch: Record<string, unknown> = { done: false, done_at: new Date().toISOString() };
      if (next) patch.due_date = next;
      const { data, error } = await sb.from('tasks').update(patch).eq('id', id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }
    body.done_at = new Date().toISOString();
  } else if (body.done === false) {
    body.done_at = null;
  }

  const { data, error } = await sb.from('tasks').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer();
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
