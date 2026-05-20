import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

function plaidBase() {
  return `https://${process.env.PLAID_ENV ?? 'sandbox'}.plaid.com`;
}

export async function POST(req: NextRequest) {
  const { public_token, metadata } = await req.json() as { public_token: string; metadata: { institution?: { name?: string } } };

  const res = await fetch(`${plaidBase()}/item/public_token/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      public_token,
    }),
  });
  const data = await res.json() as { access_token?: string; item_id?: string; error_message?: string };
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status });

  const sb = supabaseServer();
  const { error } = await sb.from('plaid_connections').upsert({
    access_token: data.access_token,
    item_id: data.item_id,
    institution_name: metadata?.institution?.name ?? null,
  }, { onConflict: 'item_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
