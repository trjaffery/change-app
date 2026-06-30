import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToAll, type PushPayload } from '@/lib/push';
import { supabaseServer } from '@/lib/supabase';

/**
 * Notification dispatcher — invoked by the cron worker every 5 minutes.
 *
 * Strategy: each notification kind has a stable dedup key (e.g.
 * `digest:2026-06-21`) written to notification_log on first send.
 * The unique (kind, key) constraint makes "have we already sent this?"
 * a single INSERT — if it fails with a uniqueness violation, we skip.
 *
 * All clock-matching uses the configured timezone in notification_prefs
 * (default America/Chicago). Cron fires at 5-min cadence, so we accept
 * any preference time within ±5 min of "now" as a match. This means
 * each scheduled time gets exactly one shot per day.
 */

// Window of [target, target + WINDOW_MIN) minutes — see within() below.
// Set to 2 so the target minute is the normal fire moment, plus one
// minute of slack if a single cron tick is dropped. With Cloudflare Cron
// Triggers running every minute, 99%+ of slots fire on their exact minute.
const WINDOW_MIN = 2;
const MILESTONES = [7, 14, 30, 60, 90, 180, 365];

interface Prefs {
  timezone: string;
  digest_enabled: boolean;
  digest_time: string;             // 'HH:MM:SS'
  habit_reminders_enabled: boolean;
  workout_reminder_enabled: boolean;
  workout_reminder_time: string;
  subscription_warnings_enabled: boolean;
  streak_milestones_enabled: boolean;
  urge_checkins_enabled: boolean;
  urge_checkin_hours: number[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  goal_evening_enabled: boolean;
  goal_evening_time: string;
}

interface LocalNow {
  date: string;                    // 'YYYY-MM-DD' in tz
  minutes: number;                 // 0..1439 since local midnight
  hour: number;                    // 0..23 local
  dow: number;                     // 0..6, Sun=0
}

/** Convert UTC `Date` into the user's local clock fields, via Intl. */
function localNow(tz: string, now: Date): LocalNow {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) if (p.type !== 'literal') parts[p.type] = p.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // Intl quirk: midnight may render as 24
  const minute = parseInt(parts.minute, 10);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date, minutes: hour * 60 + minute, hour, dow: dowMap[parts.weekday] ?? 0 };
}

/** Parse 'HH:MM' or 'HH:MM:SS' into minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * True when `now` is at or just after `target` — fires only on/after the
 * user's set minute, never before. Symmetric matching would let the 17:55
 * tick fire a 17:56 slot, which feels broken ("got it a minute early").
 * Window is [target, target + WINDOW_MIN) minutes; the dedup key prevents
 * the next tick(s) inside the window from re-sending.
 */
function within(nowMin: number, targetMin: number): boolean {
  let diff = nowMin - targetMin;
  if (diff < -720) diff += 1440;       // wraps past midnight
  if (diff > 720) diff -= 1440;
  return diff >= 0 && diff < WINDOW_MIN;
}

function inQuietHours(prefs: Prefs, nowMin: number): boolean {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) return false;
  const start = timeToMinutes(prefs.quiet_hours_start);
  const end = timeToMinutes(prefs.quiet_hours_end);
  return start <= end
    ? nowMin >= start && nowMin < end
    : nowMin >= start || nowMin < end;     // wraps midnight
}

/**
 * Atomically claim a (kind, key) slot. Returns true if we successfully
 * inserted (caller should send), false if the row already existed (skip).
 */
async function claim(sb: SupabaseClient, kind: string, key: string): Promise<boolean> {
  const { error } = await sb.from('notification_log').insert({ kind, key });
  if (!error) return true;
  // 23505 = unique_violation — someone (or a previous tick) already claimed it.
  if ((error as { code?: string }).code === '23505') return false;
  console.error('[notifications] claim error', kind, key, error);
  return false;
}

async function send(sb: SupabaseClient, kind: string, key: string, payload: PushPayload) {
  if (!(await claim(sb, kind, key))) return;
  const result = await sendPushToAll(payload);
  console.log(`[notifications] ${kind}/${key} → sent ${result.sent}, failed ${result.failed}`);
}

// ── Per-notification builders ────────────────────────────────────────────────

async function dispatchHabitReminders(sb: SupabaseClient, prefs: Prefs, now: LocalNow) {
  if (!prefs.habit_reminders_enabled) return;

  // Pull every habit that has any reminder configured (single OR multi).
  // We filter in-memory — the habits table is tiny.
  const { data: habits } = await sb.from('habits')
    .select('id, name, reminder_time, reminder_times, schedule_type, schedule_days, goal_value, goal_period')
    .is('archived_at', null);

  for (const h of habits ?? []) {
    // Multi-time wins if set; otherwise fall back to the legacy single field.
    const times = ((h.reminder_times as string[] | null) ?? []).filter(Boolean);
    if (times.length === 0 && h.reminder_time) times.push(h.reminder_time as string);
    if (times.length === 0) continue;

    // Which (if any) configured time matches the current 5-min window?
    const slotIdx = times.findIndex(t => within(now.minutes, timeToMinutes(t)));
    if (slotIdx === -1) continue;
    const slotTime = times[slotIdx].slice(0, 5);

    // Respect the habit's schedule — don't ping on off-days.
    if (h.schedule_type === 'specific_days_week') {
      const days = (h.schedule_days as number[] | null) ?? [];
      if (!days.includes(now.dow)) continue;
    }

    // Skip if already complete today (only meaningful for daily-goal habits).
    // For multi-time habits with goal_value > 1, this also gracefully stops
    // pings once they've hit count — e.g. water 5/5 won't trigger the 6pm slot.
    if (h.goal_period === 'day') {
      const { data: c } = await sb.from('habit_completions')
        .select('count').eq('habit_id', h.id).eq('date', now.date).maybeSingle();
      const done = (c?.count as number | undefined) ?? 0;
      if (done >= (h.goal_value as number)) continue;

      // Body shows progress for multi-count habits so the user knows where they are.
      const goal = h.goal_value as number;
      const body = goal > 1
        ? `${done}/${goal} so far — time for another.`
        : 'Keep the promise.';

      // Per-slot dedup so each scheduled time gets its own shot per day.
      await send(sb, 'habit-reminder', `${h.id}:${now.date}:${slotTime}`, {
        title: h.name as string,
        body,
        url: '/',
        tag: `habit-${h.id}`,
      });
      continue;
    }

    // Weekly / monthly goal habits: simple message, slot-scoped dedup.
    await send(sb, 'habit-reminder', `${h.id}:${now.date}:${slotTime}`, {
      title: h.name as string,
      body: 'Reminder — keep the promise.',
      url: '/',
      tag: `habit-${h.id}`,
    });
  }
}

async function dispatchDigest(sb: SupabaseClient, prefs: Prefs, now: LocalNow) {
  if (!prefs.digest_enabled) return;
  if (!within(now.minutes, timeToMinutes(prefs.digest_time))) return;

  const [habitsRes, splitsRes, subsRes, tasksRes] = await Promise.all([
    sb.from('habits').select('id, schedule_type, schedule_days, goal_value, goal_period').is('archived_at', null),
    sb.from('splits').select('split_days(name, day_of_week)').eq('is_active', true).limit(1),
    sb.from('finance_subscriptions').select('name, amount, next_renewal'),
    sb.from('tasks').select('done').eq('due_date', now.date),
  ]);

  const habits = (habitsRes.data ?? []).filter(h => {
    if (h.schedule_type === 'specific_days_week') {
      return ((h.schedule_days as number[] | null) ?? []).includes(now.dow);
    }
    return true;
  });

  type SplitDay = { name: string; day_of_week: number[] | null };
  const splitDays = ((splitsRes.data?.[0]?.split_days ?? []) as unknown) as SplitDay[];
  const todaySplit = splitDays.find(d => (d.day_of_week ?? []).includes(now.dow));

  // Subscription renewing within the next 24h.
  const todayDate = new Date(now.date + 'T00:00:00Z');
  const tomorrow = new Date(todayDate.getTime() + 86400000).toISOString().split('T')[0];
  const renewingTomorrow = (subsRes.data ?? []).filter(s => s.next_renewal === tomorrow);

  // Tasks for today (entered the previous evening or set just now). The
  // digest mentions any unfinished count so the morning summary feels complete.
  const todayTasks = tasksRes.data ?? [];
  const pendingTasks = todayTasks.filter(t => !t.done).length;

  const lines: string[] = [];
  if (habits.length) lines.push(`${habits.length} habit${habits.length === 1 ? '' : 's'} due`);
  if (pendingTasks) lines.push(`${pendingTasks} task${pendingTasks === 1 ? '' : 's'}`);
  if (todaySplit) lines.push(`${todaySplit.name}`);
  if (renewingTomorrow.length) {
    const total = renewingTomorrow.reduce((s, x) => s + Number(x.amount), 0);
    lines.push(`$${total.toFixed(0)} renews tomorrow`);
  }
  const body = lines.length ? lines.join(' · ') : 'Light day. Take it easy.';

  await send(sb, 'digest', now.date, {
    title: 'Today\'s plan',
    body,
    url: '/',
    tag: 'digest',
  });
}

async function dispatchWorkoutReminder(sb: SupabaseClient, prefs: Prefs, now: LocalNow) {
  if (!prefs.workout_reminder_enabled) return;
  if (!within(now.minutes, timeToMinutes(prefs.workout_reminder_time))) return;

  const { data: splits } = await sb.from('splits')
    .select('split_days(name, day_of_week)').eq('is_active', true).limit(1);
  type SplitDay = { name: string; day_of_week: number[] | null };
  const splitDays = ((splits?.[0]?.split_days ?? []) as unknown) as SplitDay[];
  const today = splitDays.find(d => (d.day_of_week ?? []).includes(now.dow));
  if (!today) return;

  // Skip if a session was already logged today.
  const { data: sessions } = await sb.from('gym_sessions').select('id').eq('date', now.date).limit(1);
  if ((sessions ?? []).length > 0) return;

  await send(sb, 'workout-reminder', now.date, {
    title: `${today.name} day`,
    body: 'No session logged yet — time to lift.',
    url: '/gym',
    tag: 'workout',
  });
}

async function dispatchSubscriptionWarnings(sb: SupabaseClient, prefs: Prefs, now: LocalNow) {
  if (!prefs.subscription_warnings_enabled) return;
  // Fire alongside the digest time so users get a "tomorrow" heads-up at the
  // same daily check-in — avoids a separate noisy ping.
  if (!within(now.minutes, timeToMinutes(prefs.digest_time))) return;

  const todayDate = new Date(now.date + 'T00:00:00Z');
  const tomorrow = new Date(todayDate.getTime() + 86400000).toISOString().split('T')[0];
  const { data: subs } = await sb.from('finance_subscriptions')
    .select('id, name, amount, next_renewal').eq('next_renewal', tomorrow);

  for (const s of subs ?? []) {
    await send(sb, 'sub-renewal', `${s.id}:${tomorrow}`, {
      title: `${s.name} renews tomorrow`,
      body: `$${Number(s.amount).toFixed(2)} on ${tomorrow}`,
      url: '/finance',
      tag: `sub-${s.id}`,
    });
  }
}

async function dispatchMilestones(sb: SupabaseClient, prefs: Prefs, now: LocalNow) {
  if (!prefs.streak_milestones_enabled) return;
  // Fire at digest time so milestones land alongside the morning roundup.
  if (!within(now.minutes, timeToMinutes(prefs.digest_time))) return;

  const [settingsRes, relapsesRes] = await Promise.all([
    sb.from('recovery_settings').select('key, value').eq('key', 'sobriety_start').maybeSingle(),
    sb.from('recovery_relapses').select('created_at').order('created_at', { ascending: false }).limit(1),
  ]);
  const sobrietyStart = (settingsRes.data as { value?: string } | null)?.value;
  if (!sobrietyStart) return;
  const latestRelapseIso = (relapsesRes.data?.[0]?.created_at as string | undefined);

  const sobrietyMs = new Date(sobrietyStart + 'T00:00:00').getTime();
  const relapseMs = latestRelapseIso ? new Date(latestRelapseIso).getTime() : 0;
  const anchorMs = Math.max(sobrietyMs, relapseMs);
  const days = Math.floor((Date.now() - anchorMs) / 86400000);
  if (!MILESTONES.includes(days)) return;

  await send(sb, 'milestone', `${days}:${now.date}`, {
    title: `${days} days`,
    body: 'A real number. You stacked these one day at a time. 🎯',
    url: '/recovery',
    tag: 'milestone',
    requireInteraction: true,
  });
}

async function dispatchTaskEvening(sb: SupabaseClient, prefs: Prefs, now: LocalNow) {
  // Pref columns are still named goal_evening_* in the DB — keeping the
  // schema stable was cheaper than a rename migration. Internally this is
  // "task evening" since /goals → /tasks.
  if (!prefs.goal_evening_enabled) return;
  if (!within(now.minutes, timeToMinutes(prefs.goal_evening_time))) return;

  // Pull anything scheduled for today; ignore recurring tasks (they don't
  // need an end-of-day nag — they reset on their own).
  const { data: tasks } = await sb.from('tasks')
    .select('done')
    .eq('due_date', now.date)
    .is('recurrence', null);
  const all = tasks ?? [];
  if (all.length === 0) return;             // no tasks set today — silent
  const pending = all.filter(t => !t.done).length;
  if (pending === 0) return;                // all checked off — nothing to nag about

  await send(sb, 'task-evening', now.date, {
    title: pending === 1 ? '1 task left' : `${pending} tasks left`,
    body: 'Couple hours left to finish today\'s list.',
    url: '/',
    tag: 'task-evening',
  });
}

async function dispatchUrgeCheckins(sb: SupabaseClient, prefs: Prefs, now: LocalNow) {
  if (!prefs.urge_checkins_enabled) return;
  if (!prefs.urge_checkin_hours.includes(now.hour)) return;
  // Only fire at the top of the hour so once-per-hour (not every 5-min tick).
  if (now.minutes % 60 > WINDOW_MIN) return;

  // Skip if user already logged an urge in the last 2 hours — they're already engaged.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await sb.from('recovery_urges')
    .select('id').gte('created_at', twoHoursAgo).limit(1);
  if ((recent ?? []).length > 0) return;

  await send(sb, 'urge-checkin', `${now.date}:${now.hour}`, {
    title: 'How are you doing?',
    body: 'A quick check-in. Tap to log how you\'re feeling.',
    url: '/recovery',
    tag: 'urge-checkin',
  });
}

// ── Public entrypoint ────────────────────────────────────────────────────────

export async function runNotificationTick(): Promise<{ ok: true; tz: string; localTime: string }> {
  const sb = supabaseServer();
  // Heartbeat: write *before* any other work so even a dispatcher crash
  // mid-tick still leaves a "cron is alive" timestamp for diagnostics.
  await sb.from('cron_heartbeat')
    .upsert({ id: 1, last_tick_at: new Date().toISOString() }, { onConflict: 'id' });

  const { data: prefsRow } = await sb.from('notification_prefs').select('*').eq('id', 1).maybeSingle();
  const prefs = (prefsRow ?? {}) as Partial<Prefs>;

  const merged: Prefs = {
    timezone: prefs.timezone ?? 'America/Chicago',
    digest_enabled: prefs.digest_enabled ?? true,
    digest_time: prefs.digest_time ?? '07:00:00',
    habit_reminders_enabled: prefs.habit_reminders_enabled ?? true,
    workout_reminder_enabled: prefs.workout_reminder_enabled ?? true,
    workout_reminder_time: prefs.workout_reminder_time ?? '17:00:00',
    subscription_warnings_enabled: prefs.subscription_warnings_enabled ?? true,
    streak_milestones_enabled: prefs.streak_milestones_enabled ?? true,
    urge_checkins_enabled: prefs.urge_checkins_enabled ?? false,
    urge_checkin_hours: prefs.urge_checkin_hours ?? [22, 23],
    quiet_hours_start: prefs.quiet_hours_start ?? null,
    quiet_hours_end: prefs.quiet_hours_end ?? null,
    goal_evening_enabled: prefs.goal_evening_enabled ?? true,
    goal_evening_time: prefs.goal_evening_time ?? '20:00:00',
  };

  const now = localNow(merged.timezone, new Date());
  const localTime = `${String(Math.floor(now.minutes / 60)).padStart(2, '0')}:${String(now.minutes % 60).padStart(2, '0')}`;

  if (inQuietHours(merged, now.minutes)) {
    return { ok: true, tz: merged.timezone, localTime: `${localTime} (quiet)` };
  }

  // Run each dispatcher independently — one failing shouldn't block the others.
  await Promise.allSettled([
    dispatchHabitReminders(sb, merged, now),
    dispatchDigest(sb, merged, now),
    dispatchWorkoutReminder(sb, merged, now),
    dispatchSubscriptionWarnings(sb, merged, now),
    dispatchMilestones(sb, merged, now),
    dispatchTaskEvening(sb, merged, now),
    dispatchUrgeCheckins(sb, merged, now),
  ]);

  return { ok: true, tz: merged.timezone, localTime };
}
