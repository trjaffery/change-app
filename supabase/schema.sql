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
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

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
  created_at TIMESTAMPTZ DEFAULT now()
);
