-- Wave 3 additions to the `tasks` table.
-- Run once in the Supabase SQL editor. All three ADD COLUMNs are idempotent.
--
-- Adds:
--   • parent_task_id — nullable FK to tasks.id, cascade delete. A task with a
--     non-null parent is a subtask; deleting the parent removes its subtasks.
--   • duration_minutes — nullable INTEGER. Optional time estimate. Sum across
--     today's undone tasks powers the "Today's plan: 2h 40m" header.
--   • tags — TEXT[] default {}. Free-form hashtag-style labels.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON tasks(parent_task_id);
