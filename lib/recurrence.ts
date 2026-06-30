/**
 * Recurrence string format:
 *   • 'daily'                — every day
 *   • 'weekly:mon,wed,fri'   — these weekdays
 *   • 'monthly:15'           — that day-of-month (1..31)
 *   • null                   — non-recurring
 *
 * `nextOccurrence` returns the next 'YYYY-MM-DD' AFTER `after` for which the
 * recurrence rule fires. Returns null for non-recurring tasks.
 */

const DAY_MS = 86400_000;

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export function nextOccurrence(rule: string | null | undefined, after: string): string | null {
  if (!rule) return null;
  const [y, m, d] = after.split('-').map(Number);
  // Use noon to dodge DST edges that flip the calendar date.
  const cursor = new Date(y, m - 1, d, 12, 0, 0);

  if (rule === 'daily') {
    cursor.setDate(cursor.getDate() + 1);
    return iso(cursor);
  }

  if (rule.startsWith('weekly:')) {
    const days = rule.slice('weekly:'.length).split(',')
      .map(s => WEEKDAY_INDEX[s.trim().toLowerCase()])
      .filter((n): n is number => typeof n === 'number');
    if (days.length === 0) return null;
    for (let i = 1; i <= 7; i++) {
      cursor.setDate(cursor.getDate() + 1);
      if (days.includes(cursor.getDay())) return iso(cursor);
      if (i === 7) cursor.setDate(cursor.getDate() - 7); // shouldn't happen
    }
    return null;
  }

  if (rule.startsWith('monthly:')) {
    const targetDay = parseInt(rule.slice('monthly:'.length), 10);
    if (!Number.isFinite(targetDay) || targetDay < 1 || targetDay > 31) return null;
    // If we're before the target day this month, use this month's date.
    if (cursor.getDate() < targetDay) {
      const tryDate = new Date(cursor.getFullYear(), cursor.getMonth(), targetDay, 12);
      if (tryDate.getMonth() === cursor.getMonth()) return iso(tryDate);
    }
    // Otherwise go forward month-by-month until we find a month that has
    // that day (handles "monthly:31" landing in Feb etc).
    let mm = cursor.getMonth() + 1;
    let yy = cursor.getFullYear();
    for (let i = 0; i < 12; i++) {
      if (mm > 11) { mm = 0; yy++; }
      const tryDate = new Date(yy, mm, targetDay, 12);
      if (tryDate.getMonth() === mm) return iso(tryDate);
      mm++;
    }
    return null;
  }

  return null;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Human label for the chips/badges in the UI. */
export function recurrenceLabel(rule: string | null | undefined): string {
  if (!rule) return '';
  if (rule === 'daily') return 'Daily';
  if (rule.startsWith('weekly:')) {
    const days = rule.slice('weekly:'.length).split(',').map(s => s.trim());
    if (days.length === 7) return 'Daily';
    return `Weekly · ${days.map(d => d[0]?.toUpperCase() + d.slice(1)).join(' ')}`;
  }
  if (rule.startsWith('monthly:')) return `Monthly · ${rule.slice('monthly:'.length)}`;
  return rule;
}

/**
 * Construct the recurrence string from a UI mode + supporting values.
 * Mode is what the picker reads/writes; we serialize on save.
 */
export function buildRecurrence(
  mode: 'none' | 'daily' | 'weekly' | 'monthly',
  weeklyDays: string[],         // ['mon','wed']
  monthlyDay: number,           // 1..31
): string | null {
  if (mode === 'none') return null;
  if (mode === 'daily') return 'daily';
  if (mode === 'weekly') {
    const cleaned = weeklyDays.map(d => d.toLowerCase()).filter(d => d in WEEKDAY_INDEX);
    if (cleaned.length === 0) return null;
    return `weekly:${cleaned.join(',')}`;
  }
  if (mode === 'monthly') {
    if (!Number.isFinite(monthlyDay) || monthlyDay < 1 || monthlyDay > 31) return null;
    return `monthly:${monthlyDay}`;
  }
  return null;
}

/** Inverse of buildRecurrence — split a stored string for the picker. */
export function parseRecurrence(rule: string | null | undefined):
  | { mode: 'none' }
  | { mode: 'daily' }
  | { mode: 'weekly'; days: string[] }
  | { mode: 'monthly'; day: number }
{
  if (!rule) return { mode: 'none' };
  if (rule === 'daily') return { mode: 'daily' };
  if (rule.startsWith('weekly:')) {
    return { mode: 'weekly', days: rule.slice('weekly:'.length).split(',').map(s => s.trim()) };
  }
  if (rule.startsWith('monthly:')) {
    return { mode: 'monthly', day: parseInt(rule.slice('monthly:'.length), 10) };
  }
  return { mode: 'none' };
}
