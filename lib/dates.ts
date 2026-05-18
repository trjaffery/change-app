// Date helpers — same logic as the original index.html (6 AM day boundary).

function padZ(n: number) {
  return String(n).padStart(2, '0');
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`;
}

/** The "active" date: before 6 AM, yesterday is still the current day. */
export function getActiveDateString(): string {
  const now = new Date();
  if (now.getHours() < 6) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return toDateString(d);
  }
  return toDateString(now);
}

/** The "tomorrow" date relative to the active day. */
export function getTomorrowDateString(): string {
  const now = new Date();
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
