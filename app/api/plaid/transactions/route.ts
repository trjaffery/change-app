import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

function plaidBase() {
  return `https://${process.env.PLAID_ENV ?? 'sandbox'}.plaid.com`;
}

interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  merchant_name: string | null;
  name: string;
  amount: number;
  date: string;
  category: string[] | null;
  personal_finance_category: { primary: string; detailed: string; confidence_level: string } | null;
}

export interface SubscriptionCandidate {
  name: string;
  amount: number;
  billing_cycle: string;
  next_renewal: string;
  occurrences: number;
}

function detectSubscriptions(transactions: PlaidTransaction[]): SubscriptionCandidate[] {
  // Only debits (positive = money leaving account) over $1
  const debits = transactions.filter(t => t.amount > 1);

  // Group by cleaned merchant name
  const groups = new Map<string, PlaidTransaction[]>();
  for (const t of debits) {
    const key = (t.merchant_name ?? t.name).trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const [merchant, txns] of groups) {
    if (txns.length < 2) continue;

    // Sort ascending by date
    txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Require consistent amount (within 15% of mean — handles tax/fee variations)
    const amounts = txns.map(t => t.amount);
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const maxDeviation = Math.max(...amounts.map(a => Math.abs(a - avgAmount)));
    if (maxDeviation / avgAmount > 0.15) continue;

    // Calculate average gap between charges in days
    const timestamps = txns.map(t => new Date(t.date).getTime());
    const gaps: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push((timestamps[i] - timestamps[i - 1]) / 86400000);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

    // Map gap to billing cycle
    let billing_cycle: string | null = null;
    if (avgGap >= 5 && avgGap <= 10) billing_cycle = 'weekly';
    else if (avgGap >= 25 && avgGap <= 36) billing_cycle = 'monthly';
    else if (avgGap >= 80 && avgGap <= 100) billing_cycle = 'quarterly';
    else if (avgGap >= 340 && avgGap <= 395) billing_cycle = 'yearly';

    if (!billing_cycle) continue;

    // Predict next charge from last known date
    const lastDate = new Date(txns[txns.length - 1].date);
    const nextDate = new Date(lastDate.getTime() + avgGap * 86400000);

    candidates.push({
      name: merchant,
      amount: Math.round(avgAmount * 100) / 100,
      billing_cycle,
      next_renewal: nextDate.toISOString().split('T')[0],
      occurrences: txns.length,
    });
  }

  // Most frequent charges first
  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}

async function fetchAllTransactions(dayWindow: number): Promise<PlaidTransaction[]> {
  const sb = supabaseServer();
  const { data: connections, error } = await sb.from('plaid_connections').select('*');
  if (error || !connections?.length) return [];

  const end = new Date().toISOString().split('T')[0];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - dayWindow);
  const start = startDate.toISOString().split('T')[0];

  const allTransactions: PlaidTransaction[] = [];

  for (const conn of connections) {
    let offset = 0;
    while (true) {
      const res = await fetch(`${plaidBase()}/transactions/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_SECRET,
          access_token: conn.access_token,
          start_date: start,
          end_date: end,
          options: { count: 500, offset, include_personal_finance_category: true },
        }),
      });
      if (!res.ok) break;
      const data = await res.json() as { transactions?: PlaidTransaction[]; total_transactions?: number };
      if (!data.transactions?.length) break;
      allTransactions.push(...data.transactions);
      offset += data.transactions.length;
      if (offset >= (data.total_transactions ?? 0) || offset >= 500) break;
    }
  }

  return allTransactions;
}

export async function GET(req: NextRequest) {
  const feed = req.nextUrl.searchParams.get('feed') === 'true';

  if (feed) {
    const txns = await fetchAllTransactions(30);
    const EXCLUDE_PFC = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES', 'INCOME']);
    const EXCLUDE_CATS = new Set(['Transfer', 'Payment', 'Bank Fees', 'Interest', 'Cash Advance', 'Tax']);
    const PAYMENT_NAME = /payment to .*(card|bank|chase|bofa|america|wells|citi|amex|discover|capital one|synchrony|barclays|apple card)|bank of america payment|online\/mobile|ach transfer|wire transfer|autopay|bill pay|payment thank you|credit card payment|epay|e-payment|card payment/i;
    const result = txns
      .filter(t => {
        if (t.amount <= 0) return false;
        const pfc = t.personal_finance_category?.primary;
        if (pfc) return !EXCLUDE_PFC.has(pfc);
        // Fallback for banks that don't return personal_finance_category
        const nameCheck = t.merchant_name ?? t.name;
        return (
          !EXCLUDE_CATS.has(t.category?.[0] ?? '') &&
          !PAYMENT_NAME.test(nameCheck) &&
          !(t.amount > 200 && /\bpayment\b/i.test(nameCheck) && t.merchant_name == null)
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return NextResponse.json(result);
  }

  const txns = await fetchAllTransactions(90);
  return NextResponse.json(detectSubscriptions(txns));
}
