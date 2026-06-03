import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { logFinanceActivity } from '@/lib/finance-activity';

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_wishlist').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { name, amount, url } = await req.json();
  if (!name || amount === undefined) return NextResponse.json({ error: 'name and amount required' }, { status: 400 });
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_wishlist').insert({
    name, amount: Number(amount), url: url || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logFinanceActivity(sb, 'add', 'wishlist', data.id, { name, amount: Number(amount) });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = supabaseServer();
  const { data: existing } = await sb.from('finance_wishlist').select('name, amount').eq('id', id).single();
  const { error } = await sb.from('finance_wishlist').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (existing) await logFinanceActivity(sb, 'delete', 'wishlist', id, existing);
  return NextResponse.json({ ok: true });
}
