import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * POST /api/goals/push
 *   body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *   Moves all undone goals from `from` → `to`.
 *
 *   Powers the "Push to tomorrow" button.
 */
export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { from, to } = await req.json();
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const { data, error } = await sb
    .from('goals')
    .update({ date: to })
    .eq('date', from)
    .eq('done', false)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pushed: data?.length ?? 0 });
}
