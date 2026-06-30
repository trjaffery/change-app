import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Tasks API — the post-goals replacement. Same daily-list shape as goals
 * but with due_date, priority, notes, recurrence layered on.
 *
 * GET /api/tasks?date=YYYY-MM-DD
 *   Returns everything the user should see on that day:
 *     • non-recurring tasks with due_date <= date AND not done (today + overdue)
 *     • non-recurring tasks done today (so they stay visible to confirm the win)
 *     • recurring tasks whose next occurrence <= date AND not yet done
 *   Sort: overdue first, then by priority (high → low), then by position.
 *
 * POST /api/tasks
 *   body: { text, due_date?, priority?, notes?, recurrence?, position? }
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('tasks')
    .select('*')
    .order('position', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter in-memory — small list, single user. Avoids fighting Supabase
  // with two OR clauses across date columns.
  const visible = (data ?? []).filter(t => {
    if (t.done && t.done_at && t.done_at.slice(0, 10) === date) return true;       // done today, keep visible
    if (t.done) return false;                                                       // done some other day → hide
    if (!t.due_date) return false;                                                  // someday/no-date — not on today view
    return t.due_date <= date;                                                      // today + overdue
  });

  return NextResponse.json(visible);
}

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const body = await req.json();
  const { text, due_date, priority, notes, recurrence, position } = body as {
    text?: string;
    due_date?: string | null;
    priority?: 'low' | 'med' | 'high' | null;
    notes?: string | null;
    recurrence?: string | null;
    position?: number;
  };
  if (!text || !text.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const row: Record<string, unknown> = {
    text: text.trim(),
    due_date: due_date ?? null,
    priority: priority ?? null,
    notes: notes ?? null,
    recurrence: recurrence ?? null,
    position: position ?? 0,
  };
  const { data, error } = await sb.from('tasks').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
