import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// GET /api/finance/activity?limit=30 → newest first
export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('limit') ?? 30)));
  const { data, error } = await sb
    .from('finance_activity')
    .select('id, action, entity_type, entity_id, snapshot, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
