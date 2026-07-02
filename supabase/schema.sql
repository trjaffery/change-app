-- Run this once in the Supabase SQL editor to set up all tables.

-- Goals
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  text TEXT NOT NULL,
  done BOOLEAN DEFAULT false,
  done_at TIMESTAMPTZ,
  queued BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_date_idx ON goals(date);

-- Gym sets
CREATE TABLE IF NOT EXISTS gym_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  exercise TEXT NOT NULL,
  reps INTEGER NOT NULL,
  weight NUMERIC NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_sets_date_idx ON gym_sets(date);
CREATE INDEX IF NOT EXISTS gym_sets_exercise_idx ON gym_sets(exercise);

-- Recovery: key-value settings (sobriety_start, etc.)
CREATE TABLE IF NOT EXISTS recovery_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Recovery: urge log
CREATE TABLE IF NOT EXISTS recovery_urges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Recovery: relapse log
CREATE TABLE IF NOT EXISTS recovery_relapses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Goal streak state (single row)
CREATE TABLE IF NOT EXISTS goal_streak (
  id INTEGER PRIMARY KEY DEFAULT 1,
  count INTEGER DEFAULT 0,
  last_processed_date DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO goal_streak(id) VALUES(1) ON CONFLICT DO NOTHING;

-- Habits
CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6BE3A4',
  position INTEGER DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Schedule
  schedule_type TEXT NOT NULL DEFAULT 'daily',
  -- 'daily' | 'specific_days_week' | 'days_per_week' | 'specific_days_month' | 'days_per_month'
  schedule_days INTEGER[] DEFAULT NULL,
  -- specific_days_week: [0..6] (0=Sun); specific_days_month: [1..31]
  schedule_count INTEGER DEFAULT NULL,
  -- days_per_week: e.g. 3; days_per_month: e.g. 10
  -- Goal
  goal_period TEXT NOT NULL DEFAULT 'day', -- 'day' | 'week' | 'month'
  goal_value INTEGER NOT NULL DEFAULT 1    -- target completions per period
);

-- Run this if habits table already exists:
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'daily';
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS schedule_days INTEGER[] DEFAULT NULL;
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS schedule_count INTEGER DEFAULT NULL;
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS goal_period TEXT NOT NULL DEFAULT 'day';
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS goal_value INTEGER NOT NULL DEFAULT 1;

-- Habit completions (count = how many times logged on that date)
CREATE TABLE IF NOT EXISTS habit_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(habit_id, date)
);
-- Run this if habit_completions table already exists:
-- ALTER TABLE habit_completions ADD COLUMN IF NOT EXISTS count INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS habit_completions_date_idx ON habit_completions(date);
CREATE INDEX IF NOT EXISTS habit_completions_habit_idx ON habit_completions(habit_id);

-- Workout splits (named programs, e.g. "PPL", "Upper/Lower")
CREATE TABLE IF NOT EXISTS splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Training days within a split (e.g. "Push Day", "Pull Day")
CREATE TABLE IF NOT EXISTS split_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id UUID NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  day_of_week INTEGER[] DEFAULT NULL,  -- 0=Sun … 6=Sat; null = any day
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Exercise templates within a training day
CREATE TABLE IF NOT EXISTS split_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_day_id UUID NOT NULL REFERENCES split_days(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL,
  target_sets INTEGER NOT NULL DEFAULT 3,
  target_reps TEXT NOT NULL DEFAULT '8',
  body_part TEXT,
  -- Phase 4 #14: per-exercise rest override (seconds). Falls back to the
  -- session-level restDuration when NULL.
  default_rest_seconds INTEGER,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE split_exercises ADD COLUMN IF NOT EXISTS body_part TEXT;
ALTER TABLE split_exercises ADD COLUMN IF NOT EXISTS default_rest_seconds INTEGER;

-- Add split_day_id to gym_sets to link logged sets to templates
-- ALTER TABLE gym_sets ADD COLUMN IF NOT EXISTS split_day_id UUID REFERENCES split_days(id);

-- Workout sessions (one per gym visit — tracks duration)
CREATE TABLE IF NOT EXISTS gym_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_day_id UUID REFERENCES split_days(id),
  date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE gym_sessions ADD COLUMN IF NOT EXISTS rpe INTEGER;
ALTER TABLE gym_sessions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Body weight (one row per day, lb)
CREATE TABLE IF NOT EXISTS body_weight (
  date DATE PRIMARY KEY,
  weight NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Finance activity log (audit trail for items / subscriptions).
-- Historic rows with entity_type = 'order' or 'wishlist' may still exist and
-- render fine in the UI; new writes are limited to items and subscriptions.
-- The legacy finance_orders and finance_wishlist tables are no longer used:
--   DROP TABLE IF EXISTS finance_orders;
--   DROP TABLE IF EXISTS finance_wishlist;
-- entity_id is text (not a FK) so deletes still log without orphaning.
-- snapshot is whatever is needed to render the row (name, amount, category).
CREATE TABLE IF NOT EXISTS finance_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_activity_created_idx ON finance_activity(created_at DESC);

-- Diary (one freeform entry per day; mood 1-5 optional)
CREATE TABLE IF NOT EXISTS diary_entries (
  date DATE PRIMARY KEY,
  body TEXT NOT NULL DEFAULT '',
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diary_entries_date_idx ON diary_entries(date DESC);

-- Relapse prevention plan (single row, single-user app)
CREATE TABLE IF NOT EXISTS rp_plan (
  id INTEGER PRIMARY KEY DEFAULT 1,
  triggers TEXT DEFAULT '',
  warning_signs TEXT DEFAULT '',
  replacement_behaviors TEXT DEFAULT '',
  support_people JSONB DEFAULT '[]'::jsonb,
  why TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO rp_plan(id) VALUES(1) ON CONFLICT DO NOTHING;

-- The urge_surfs table is no longer used — the standalone "Surf an urge"
-- feature was removed in favor of Crisis Mode covering the same ground. To
-- drop it after the code is updated:
--   DROP TABLE IF EXISTS urge_surfs;

-- Whether this urge entry counts as a crisis-level moment (i.e. an "I made it"
-- log from Crisis Mode, OR a normal urge the user later marked as crisis).
-- One-time backfill from the legacy [crisis-mode] note prefix:
--   ALTER TABLE recovery_urges ADD COLUMN IF NOT EXISTS is_crisis BOOLEAN NOT NULL DEFAULT false;
--   UPDATE recovery_urges SET is_crisis = true WHERE note LIKE '[crisis-mode]%';
ALTER TABLE recovery_urges ADD COLUMN IF NOT EXISTS is_crisis BOOLEAN NOT NULL DEFAULT false;

-- Tags on each urge log entry. Replaces the older split between `halt` (4 fixed
-- codes) and `triggers` (5 categorical labels) — everything's now one free-form
-- tag bag, with personalized suggestions surfaced in the UI.
-- One-time migration when upgrading from the old schema:
--   UPDATE recovery_urges
--   SET triggers = COALESCE(triggers, '{}') ||
--     CASE WHEN 'H' = ANY(COALESCE(halt, '{}')) THEN ARRAY['Hungry']::TEXT[] ELSE '{}'::TEXT[] END ||
--     CASE WHEN 'A' = ANY(COALESCE(halt, '{}')) THEN ARRAY['Angry']::TEXT[] ELSE '{}'::TEXT[] END ||
--     CASE WHEN 'L' = ANY(COALESCE(halt, '{}')) THEN ARRAY['Lonely']::TEXT[] ELSE '{}'::TEXT[] END ||
--     CASE WHEN 'T' = ANY(COALESCE(halt, '{}')) THEN ARRAY['Tired']::TEXT[] ELSE '{}'::TEXT[] END
--   WHERE halt IS NOT NULL AND array_length(halt, 1) > 0;
--   ALTER TABLE recovery_urges RENAME COLUMN triggers TO tags;
--   ALTER TABLE recovery_urges DROP COLUMN halt;
ALTER TABLE recovery_urges ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- AI pattern-analysis cache (single row). Busted when the cached urge_count
-- diverges from the current count — i.e. anything you log invalidates it.
-- The legacy surf_count column is no longer used; safe to drop:
--   ALTER TABLE rp_patterns_cache DROP COLUMN IF EXISTS surf_count;
CREATE TABLE IF NOT EXISTS rp_patterns_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  urge_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  insights JSONB NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO rp_patterns_cache(id) VALUES(1) ON CONFLICT DO NOTHING;

-- Weekly review cache. Keyed by the week-start date (Sunday) so historical
-- weeks remain queryable. Auto-populated on Sunday/Monday; manual regenerate
-- overwrites the row.
CREATE TABLE IF NOT EXISTS weekly_review_cache (
  week_start DATE PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review JSONB NOT NULL
);

-- Coach running summary. Single row; updated after each completed chat reply
-- so the truncated 20-message context window still has a top-of-thread anchor.
CREATE TABLE IF NOT EXISTS coach_session_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  summary TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO coach_session_state(id) VALUES(1) ON CONFLICT DO NOTHING;

-- Web Push subscriptions. One row per (device, browser) install of the PWA.
-- The endpoint is the unique key — re-subscribing on the same device just
-- upserts. p256dh + auth are the keys the browser hands us at subscribe time.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_created_idx ON push_subscriptions(created_at DESC);

-- Stage 2: per-habit reminder time (local time-of-day, no timezone — interpreted
-- against notification_prefs.timezone at send time). NULL = no reminder.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS reminder_time TIME;

-- Stage 3: multiple reminders per habit (e.g. drink water 5x/day → 9am, 12pm, 3pm, 6pm).
-- reminder_time is kept for back-compat; if reminder_times is non-empty it wins.
-- Empty array = no reminders; NULL is treated the same as empty.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS reminder_times TIME[];
-- One-time migration: copy any existing single-time reminder into the new array.
UPDATE habits
   SET reminder_times = ARRAY[reminder_time]
 WHERE reminder_time IS NOT NULL
   AND (reminder_times IS NULL OR cardinality(reminder_times) = 0);

-- Stage 2: notification preferences. Singleton row (id=1). Quiet hours suppress
-- everything except crisis-flagged pushes; digest/workout times use the configured
-- timezone for clock matching.
CREATE TABLE IF NOT EXISTS notification_prefs (
  id INTEGER PRIMARY KEY DEFAULT 1,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  digest_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_time TIME NOT NULL DEFAULT '07:00',
  habit_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  workout_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  workout_reminder_time TIME NOT NULL DEFAULT '17:00',
  subscription_warnings_enabled BOOLEAN NOT NULL DEFAULT true,
  streak_milestones_enabled BOOLEAN NOT NULL DEFAULT true,
  urge_checkins_enabled BOOLEAN NOT NULL DEFAULT false,
  urge_checkin_hours INTEGER[] NOT NULL DEFAULT ARRAY[22, 23],
  quiet_hours_start TIME,    -- e.g. '23:00'
  quiet_hours_end TIME,      -- e.g. '06:00'  (wraps midnight if start > end)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO notification_prefs(id) VALUES(1) ON CONFLICT DO NOTHING;

-- Stage 3: goal alerts. Evening check-in fires at goal_evening_time if any
-- of today's goals are still unchecked. The morning digest already includes
-- a "N goals to hit" line — this is the second-half-of-day nudge.
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS goal_evening_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS goal_evening_time TIME NOT NULL DEFAULT '20:00';

-- Stage 3: cron heartbeat. Singleton row updated on every dispatcher tick so
-- diagnostics can show "cron last fired Xm ago" even when no notification
-- was actually sent (e.g. nothing matched the current time window).
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_tick_at TIMESTAMPTZ
);
INSERT INTO cron_heartbeat(id) VALUES(1) ON CONFLICT DO NOTHING;

-- Stage 2: dedup log so cron doesn't double-fire a digest or milestone in the
-- same window. Keyed by (kind, key) — e.g. ('digest', '2026-06-21') or
-- ('habit-reminder', '<habit_id>:2026-06-21') or ('milestone', '30:2026-06-21').
CREATE TABLE IF NOT EXISTS notification_log (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kind, key)
);
CREATE INDEX IF NOT EXISTS notification_log_sent_idx ON notification_log(sent_at DESC);

-- Drop sets: a set performed immediately after its parent at reduced weight.
-- parent_set_id links the drop to the set it follows; deleting the parent
-- cascades to its drops. NULL = a normal (top-level) set.
ALTER TABLE gym_sets ADD COLUMN IF NOT EXISTS parent_set_id UUID REFERENCES gym_sets(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS gym_sets_parent_idx ON gym_sets(parent_set_id);
