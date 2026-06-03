import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { logFinanceActivity } from '@/lib/finance-activity';

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_subscriptions').select('*').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, amount, billing_cycle, next_renewal } = body;
  if (!name || amount === undefined) return NextResponse.json({ error: 'name and amount required' }, { status: 400 });
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_subscriptions').insert({
    name,
    amount: Number(amount),
    billing_cycle: billing_cycle ?? 'monthly',
    next_renewal: next_renewal || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logFinanceActivity(sb, 'add', 'subscription', data.id, { name, amount: Number(amount), billing_cycle: billing_cycle ?? 'monthly' });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, name, amount, billing_cycle, next_renewal } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_subscriptions')
    .update({ name, amount: Number(amount), billing_cycle, next_renewal: next_renewal || null })
    .eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logFinanceActivity(sb, 'edit', 'subscription', id, { name, amount: Number(amount), billing_cycle });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = supabaseServer();
  const { data: existing } = await sb.from('finance_subscriptions').select('name, amount, billing_cycle').eq('id', id).single();
  const { error } = await sb.from('finance_subscriptions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (existing) await logFinanceActivity(sb, 'delete', 'subscription', id, existing);
  return NextResponse.json({ ok: true });
}
