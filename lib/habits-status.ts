// Deterministic per-habit status. Replaces an AI status-call that was paying
// tokens for what the completion math already determines.

export type HabitStatus = 'crushing' | 'on_track' | 'struggling' | 'new';

export interface HabitInput {
  id: string;
  name: string;
  goal_value: number;
  goal_period: string;
  schedule_type: string;
  schedule_days: number[] | null;
  schedule_count: number | null;
  created_at: string;
}

export interface HabitStatusResult {
  habitId: string;
  name: string;
  status: HabitStatus;
  completion_rate: number;
  days_hit: number;
  expected_days: number;
  current_streak: number;
  total_count: number;
  target_count: number;
  schedule_type: string;
  schedule_count: number | null;
  goal_value: number;
  goal_period: string;
  is_new: boolean;
}

const WINDOW_DAYS = 14;

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

export function expectedDaysInWindow(h: HabitInput, windowDays: number, now: Date = new Date()): number {
  if (h.schedule_type === 'daily') return windowDays;
  if (h.schedule_type === 'days_per_week') return Math.round((h.schedule_count ?? 0) * (windowDays / 7));
  if (h.schedule_type === 'days_per_month') return Math.round((h.schedule_count ?? 0) * (windowDays / 30));
  if (h.schedule_type === 'specific_days_week' && h.schedule_days?.length) {
    let n = 0;
    for (let i = 0; i < windowDays; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      if (h.schedule_days.includes(d.getDay())) n++;
    }
    return n;
  }
  if (h.schedule_type === 'specific_days_month' && h.schedule_days?.length) {
    let n = 0;
    for (let i = 0; i < windowDays; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      if (h.schedule_days.includes(d.getDate())) n++;
    }
    return n;
  }
  return windowDays;
}

function currentStreak(comps: { date: string; count: number }[], goalValue: number, now: Date): number {
  const hit = new Set(comps.filter(c => c.count >= goalValue).map(c => c.date));
  let streak = 0;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (!hit.has(toDateStr(d))) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 60; i++) {
    if (!hit.has(toDateStr(d))) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function computeHabitStatus(
  h: HabitInput,
  comps: { date: string; count: number }[],
  now: Date = new Date(),
): HabitStatusResult {
  const createdAt = new Date(h.created_at);
  const daysSinceCreation = Math.max(1, Math.floor((now.getTime() - createdAt.getTime()) / 86400000));
  const isNew = daysSinceCreation < WINDOW_DAYS;
  const effectiveWindow = Math.min(WINDOW_DAYS, daysSinceCreation);

  const expected = Math.max(1, expectedDaysInWindow(h, effectiveWindow, now));
  const daysHit = comps.filter(c => c.count >= h.goal_value).length;
  const totalCount = comps.reduce((s, c) => s + c.count, 0);
  const targetCount = expected * h.goal_value;
  const rate = totalCount / targetCount;
  const streak = currentStreak(comps, h.goal_value, now);

  let status: HabitStatus;
  if (isNew) status = 'new';
  else if (rate >= 1.1) status = 'crushing';
  else if (rate >= 0.8) status = 'on_track';
  else status = 'struggling';

  return {
    habitId: h.id,
    name: h.name,
    status,
    completion_rate: Math.round(rate * 100),
    days_hit: daysHit,
    expected_days: expected,
    current_streak: streak,
    total_count: totalCount,
    target_count: targetCount,
    schedule_type: h.schedule_type,
    schedule_count: h.schedule_count,
    goal_value: h.goal_value,
    goal_period: h.goal_period,
    is_new: isNew,
  };
}
