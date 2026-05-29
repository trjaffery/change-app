import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { computeCorrelations } from '@/lib/correlations';

export async function GET() {
  try {
    const sb = supabaseServer();
    const correlations = await computeCorrelations(sb);
    return NextResponse.json({ correlations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[insights] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
