'use client';
import { Flame } from 'lucide-react';

/**
 * Three-stat strip at the top of /diary.
 *   ⌇ streak  ·  N words today  ·  N entries logged
 *
 * Streak = consecutive days with a non-blank entry ending today (or yesterday
 * if today is still blank — matches BodyWeightCard's streak logic).
 */

interface Entry { date: string; body: string; mood: number | null }

function wordCount(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function computeStreak(entries: Entry[], today: string): number {
  // entries are passed newest-first; build a set of dates with non-blank bodies.
  const dates = new Set(entries.filter(e => e.body?.trim()).map(e => e.date));
  let streak = 0;
  const cursor = new Date(today + 'T12:00:00');
  while (dates.has(cursor.toISOString().split('T')[0])) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function DiaryHeader({
  entries,
  today,
  todayBody,
  total,
}: {
  entries: Entry[];
  today: string;
  todayBody: string;
  total: number;
}) {
  const streak = computeStreak(entries, today);
  const words = wordCount(todayBody);

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        marginBottom: 14,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-tertiary)',
        letterSpacing: '0.06em',
      }}
    >
      <span style={{ color: streak > 0 ? 'var(--success)' : 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Flame size={13} strokeWidth={1.75} />
        {streak} day{streak === 1 ? '' : 's'}
      </span>
      <span>·</span>
      <span style={{ color: 'var(--text-secondary)' }}>
        {words} {words === 1 ? 'word' : 'words'} today
      </span>
      <span>·</span>
      <span>{total} total {total === 1 ? 'entry' : 'entries'}</span>
    </div>
  );
}
