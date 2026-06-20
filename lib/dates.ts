// Date helpers — canonical "today" with a 6 AM day boundary (matches the
// original index.html). Convention used across the app:
//
//   • Anywhere a *calendar day* matters (today's habits, today's goals,
//     today's diary, the active workout date) use `getActiveDateString()`.
//     Before 6 AM local time it returns yesterday's calendar date so a
//     late-night log still counts as the prior day.
//
//   • Anywhere a *clock hour* matters (time-of-day urge clustering, the
//     play-the-tape prompt's current-hour anchor) use local `getHours()` so
//     "evening" means what the user thinks.
//
//   • Anywhere a *day-of-week* matters server-side (correlations, momentum
//     windows) use UTC day boundaries. This keeps the server's bucket
//     assignments stable across timezones; users in non-UTC zones see a
//     slight shift at midnight UTC, which is acceptable for the trailing-
//     window aggregates we compute.
//
// When in doubt, prefer `getActiveDateString()` + this module — don't
// hand-roll `new Date()` arithmetic in components.

function padZ(n: number) {
  return String(n).padStart(2, '0');
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`;
}

export function getActiveDateString(): string {
  const now = new Date();
  if (now.getHours() < 6) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return toDateString(d);
  }
  return toDateString(now);
}

export function getTomorrowDateString(): string {
  const now = new Date();
  // Before 6 AM the active day is still "yesterday", so tomorrow is today's calendar date.
  if (now.getHours() < 6) return toDateString(now);
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return toDateString(d);
}

/** Format "YYYY-MM-DD" → "Sat, May 9" */
export function formatDate(str: string): string {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${d}`;
}
