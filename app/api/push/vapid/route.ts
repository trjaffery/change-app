import { NextResponse } from 'next/server';

// Returns the public VAPID key so the browser can subscribe.
// (Public — safe to expose; only the private key must stay server-side.)
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json({ error: 'VAPID_PUBLIC_KEY not configured' }, { status: 500 });
  }
  return NextResponse.json({ publicKey: key });
}
