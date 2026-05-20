import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

function plaidBase() {
  return `https://${process.env.PLAID_ENV ?? 'sandbox'}.plaid.com`;
}

interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string;
  balances: { current: number | null; available: number | null };
}

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const itemId = req.nextUrl.searchParams.get('item_id');
  let query = sb.from('plaid_connections').select('*');
  if (itemId) query = query.eq('item_id', itemId) as typeof query;
  const { data: connections, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!connections?.length) return NextResponse.json([]);

  const results = await Promise.all(
    connections.map(async (conn) => {
      const res = await fetch(`${plaidBase()}/accounts/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_SECRET,
          access_token: conn.access_token,
        }),
      });
      const data = await res.json() as { accounts?: PlaidAccount[] };
      return {
        institution_name: conn.institution_name as string | null,
        item_id: conn.item_id as string,
        accounts: (data.accounts ?? []) as PlaidAccount[],
      };
    })
  );

  return NextResponse.json(results);
}

export async function DELETE(req: NextRequest) {
  const { item_id } = await req.json() as { item_id: string };
  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });
  const sb = supabaseServer();
  const { error } = await sb.from('plaid_connections').delete().eq('item_id', item_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
