import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * One-stop notification health check. Returns everything I'd want to look
 * at if a push didn't arrive:
 *   • Whether the server can even see the VAPID + cron secrets
 *   • How many push subscriptions are stored, and how stale they look
 *   • The current effective prefs (so we can spot a typo or all-off state)
 *   • The most recent rows in notification_log (so we can confirm whether
 *     the cron is firing AT ALL — a 5-min-fresh row means the loop is alive)
 *   • Per-habit reminder analysis: time set, scheduled today, fired today
 *
 * Surfaced in Settings → Diagnostics, but also useful via:
 *   curl https://YOUR-APP/api/push/diagnostics | jq
 * (cookie-gated by middleware so it's still locked to you.)
 */
export async function GET() {
  const sb = supabaseServer();
  const now = new Date();

  const env = {
    vapidPublic: !!process.env.VAPID_PUBLIC_KEY,
    vapidPrivate: !!process.env.VAPID_PRIVATE_KEY,
    vapidSubject: !!process.env.VAPID_SUBJECT,
    cronSecret: !!process.env.CRON_SECRET,
  };

  const [
    subsRes,
    prefsRes,
    logRes,
    habitsRes,
    heartbeatRes,
  ] = await Promise.all([
    sb.from('push_subscriptions').select('id, created_at, last_used_at, user_agent').order('created_at', { ascending: false }),
    sb.from('notification_prefs').select('*').eq('id', 1).maybeSingle(),
    sb.from('notification_log').select('kind, key, sent_at').order('sent_at', { ascending: false }).limit(20),
    sb.from('habits').select('id, name, reminder_time, reminder_times, schedule_type, schedule_days').is('archived_at', null),
    sb.from('cron_heartbeat').select('last_tick_at').eq('id', 1).maybeSingle(),
  ]);

  const heartbeatIso = (heartbeatRes.data as { last_tick_at?: string } | null)?.last_tick_at ?? null;
  const heartbeatAgeMin = heartbeatIso
    ? Math.round((now.getTime() - new Date(heartbeatIso).getTime()) / 60000)
    : null;

  const prefs = (prefsRes.data ?? {}) as Record<string, unknown>;
  const tz = (prefs.timezone as string) || 'America/Chicago';

  // What's the user's local time right now?
  const localFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of localFmt.formatToParts(now)) if (p.type !== 'literal') parts[p.type] = p.value;
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const localHour = parseInt(parts.hour, 10) % 24;
  const localMinute = parseInt(parts.minute, 10);
  const localTime = `${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')}`;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[parts.weekday] ?? 0;

  // Habits with reminders — when do they next fire & did they already today?
  const log = logRes.data ?? [];
  const habitReminders = (habitsRes.data ?? [])
    .filter(h => h.reminder_time)
    .map(h => {
      const scheduledDays = (h.schedule_days as number[] | null) ?? null;
      let scheduledToday = true;
      if (h.schedule_type === 'specific_days_week') {
        scheduledToday = scheduledDays?.includes(dow) ?? false;
      }
      const dedupKey = `${h.id}:${localDate}`;
      const firedToday = log.some(l => l.kind === 'habit-reminder' && l.key === dedupKey);
      return {
        name: h.name,
        reminderTime: (h.reminder_time as string).slice(0, 5),
        scheduledToday,
        firedToday,
      };
    });

  // Best-guess "is the cron alive" — any log row in the last 30 minutes implies
  // the dispatcher ran at least once. If it's been hours, cron is probably down.
  const newestLog = log[0]?.sent_at;
  const lastLogAgeMin = newestLog
    ? Math.round((now.getTime() - new Date(newestLog).getTime()) / 60000)
    : null;

  return NextResponse.json({
    now: now.toISOString(),
    tz,
    localTime,
    localDate,
    env,
    subscriptions: {
      count: (subsRes.data ?? []).length,
      newest: subsRes.data?.[0] ?? null,
    },
    prefs,
    habitReminders,
    recentLog: log,
    lastLogAgeMin,
    heartbeat: { iso: heartbeatIso, ageMin: heartbeatAgeMin },
  });
}
