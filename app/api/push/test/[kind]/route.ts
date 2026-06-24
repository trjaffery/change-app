import { NextRequest, NextResponse } from 'next/server';
import { sendPushToAll, type PushPayload } from '@/lib/push';

/**
 * Synthetic push for each notification kind — bypasses time/dedup checks
 * so the user can verify the *delivery* path works for each style of
 * notification. Different from POST /api/push/test which just sends a
 * generic "Test push".
 *
 * Usage: POST /api/push/test/<kind>  where kind is one of:
 *   digest | habit | workout | sub-renewal | milestone | urge | goal-evening
 */
const SAMPLES: Record<string, PushPayload> = {
  'digest': {
    title: 'Today',
    body: 'Sample: 3 habits due · Push day · $42 renews tomorrow',
    url: '/',
    tag: 'demo-digest',
  },
  'habit': {
    title: '5 salah',
    body: 'Reminder — keep the promise.',
    url: '/',
    tag: 'demo-habit',
  },
  'workout': {
    title: 'Push day',
    body: 'You haven\'t logged a workout yet today.',
    url: '/gym',
    tag: 'demo-workout',
  },
  'sub-renewal': {
    title: 'Netflix renews tomorrow',
    body: '$15.49 on the 25th',
    url: '/finance',
    tag: 'demo-sub',
  },
  'milestone': {
    title: '30 days',
    body: 'A real number. You stacked these one day at a time.',
    url: '/recovery',
    tag: 'demo-milestone',
    requireInteraction: true,
  },
  'urge': {
    title: 'How are you doing?',
    body: 'A quick check-in. Tap to log how you\'re feeling.',
    url: '/recovery',
    tag: 'demo-urge',
  },
  'goal-evening': {
    title: 'Goals',
    body: 'Sample: 2 goals still unchecked tonight.',
    url: '/',
    tag: 'demo-goal-evening',
  },
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const payload = SAMPLES[kind];
  if (!payload) {
    return NextResponse.json({ error: `unknown kind: ${kind}` }, { status: 400 });
  }
  try {
    const result = await sendPushToAll(payload);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
