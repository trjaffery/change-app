import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// Singleton row (id=1) seeded by the schema.

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from('notification_prefs').select('*').eq('id', 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}

const ALLOWED_KEYS = new Set([
  'timezone',
  'digest_enabled', 'digest_time',
  'habit_reminders_enabled',
  'workout_reminder_enabled', 'workout_reminder_time',
  'subscription_warnings_enabled',
  'streak_milestones_enabled',
  'urge_checkins_enabled', 'urge_checkin_hours',
  'quiet_hours_start', 'quiet_hours_end',
]);

export async function PUT(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;
  const update: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_KEYS.has(k)) update[k] = v;
  }
  const sb = supabaseServer();
  const { data, error } = await sb.from('notification_prefs')
    .upsert(update, { onConflict: 'id' }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
