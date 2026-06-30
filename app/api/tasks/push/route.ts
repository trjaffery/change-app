import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * POST /api/tasks/push
 *   body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *   Pushes all undone, non-recurring tasks dated `from` (or earlier — i.e.
 *   overdue) forward to `to`. Recurring tasks are left alone because they
 *   manage their own due_date via the recurrence rule.
 */
export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { from, to } = await req.json();
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const { data, error } = await sb
    .from('tasks')
    .update({ due_date: to })
    .lte('due_date', from)
    .eq('done', false)
    .is('recurrence', null)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pushed: data?.length ?? 0 });
}
