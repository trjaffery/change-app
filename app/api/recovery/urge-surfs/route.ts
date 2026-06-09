import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/recovery/urge-surfs?since=ISO → { total, full, partial, rows }
//   Defaults to last 30 days if since omitted.
export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const sinceParam = req.nextUrl.searchParams.get('since');
  const since = sinceParam ?? new Date(Date.now() - 30 * 86400000).toISOString();

  const { data, error } = await sb
    .from('urge_surfs')
    .select('id, surfed_at, completed_seconds, full_completion')
    .gte('surfed_at', since)
    .order('surfed_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const full = rows.filter(r => r.full_completion).length;
  return NextResponse.json({ total: rows.length, full, partial: rows.length - full, rows });
}

// POST { completed_seconds, full_completion }
export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { completed_seconds, full_completion } = await req.json();
  if (typeof completed_seconds !== 'number' || completed_seconds < 0) {
    return NextResponse.json({ error: 'completed_seconds required' }, { status: 400 });
  }
  const { data, error } = await sb
    .from('urge_surfs')
    .insert({ completed_seconds: Math.round(completed_seconds), full_completion: !!full_completion })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
