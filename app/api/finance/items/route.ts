import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { logFinanceActivity } from '@/lib/finance-activity';

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_items').select('*').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category, name, value } = body;
  if (!category || !name || value === undefined) return NextResponse.json({ error: 'category, name, value required' }, { status: 400 });
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_items').insert({ category, name, value: Number(value) }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logFinanceActivity(sb, 'add', 'item', data.id, { category, name, value: Number(value) });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, name, value } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = supabaseServer();
  const { data, error } = await sb.from('finance_items').update({ name, value: Number(value) }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logFinanceActivity(sb, 'edit', 'item', id, { category: data.category, name, value: Number(value) });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = supabaseServer();
  // Look up before deleting so we can snapshot what was lost.
  const { data: existing } = await sb.from('finance_items').select('category, name, value').eq('id', id).single();
  const { error } = await sb.from('finance_items').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (existing) await logFinanceActivity(sb, 'delete', 'item', id, existing);
  return NextResponse.json({ ok: true });
}
