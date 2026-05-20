import { NextResponse } from 'next/server';

function plaidBase() {
  return `https://${process.env.PLAID_ENV ?? 'sandbox'}.plaid.com`;
}

export async function POST() {
  const res = await fetch(`${plaidBase()}/link/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      client_name: 'Change',
      language: 'en',
      country_codes: ['US'],
      user: { client_user_id: 'change-user' },
      products: ['transactions'],
    }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status });
  return NextResponse.json({ link_token: data.link_token });
}
