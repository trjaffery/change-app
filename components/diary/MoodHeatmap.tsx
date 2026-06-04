'use client';

interface Entry { date: string; mood: number | null; body: string }

const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4'];
const DAYS = 60;

/**
 * 60-day calendar grid. Each square is a day; colored by mood if tagged,
 * faint if a non-blank entry exists without mood, blank for empty days.
 * Tap → calls onSelect with the date; the parent jumps to that entry.
 */
export default function MoodHeatmap({
  entries,
  today,
  onSelect,
}: {
  entries: Entry[];
  today: string;
  onSelect: (date: string) => void;
}) {
  // Build a quick lookup by date.
  const byDate = new Map(entries.map(e => [e.date, e]));

  // Build the array of days, oldest first, so the grid reads left-to-right top-down.
  const cells: { date: string; entry: Entry | undefined; isToday: boolean }[] = [];
  const todayDate = new Date(today + 'T12:00:00');
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    cells.push({ date: iso, entry: byDate.get(iso), isToday: iso === today });
  }

  function cellColor(c: { entry: Entry | undefined }) {
    if (!c.entry || !c.entry.body?.trim()) return 'rgba(255,255,255,0.05)';
    if (c.entry.mood !== null && c.entry.mood !== undefined) return MOOD_TONES[c.entry.mood - 1];
    // Entry exists but no mood — use a neutral light tint
    return 'rgba(180,180,200,0.28)';
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <style>{`
        .mh-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(14px, 1fr));
          gap: 3px;
          padding: 2px;
        }
        .mh-cell {
          aspect-ratio: 1 / 1;
          border-radius: 3px;
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 120ms ease;
          -webkit-tap-highlight-color: transparent;
          border: 0;
          padding: 0;
        }
        .mh-cell:active { transform: scale(0.85); }
        .mh-cell.today { box-shadow: 0 0 0 1.5px rgba(255,255,255,0.9); }
        .mh-cell:hover { box-shadow: 0 0 0 1px rgba(255,255,255,0.4); }
      `}</style>
      <div className="mh-grid" aria-label="Mood heatmap, last 60 days">
        {cells.map(c => {
          const filled = !!c.entry?.body?.trim();
          return (
            <button
              key={c.date}
              className={`mh-cell${c.isToday ? ' today' : ''}`}
              style={{ background: cellColor(c) }}
              onClick={() => filled && onSelect(c.date)}
              disabled={!filled}
              aria-label={`${c.date}${filled ? '' : ' (no entry)'}`}
              title={c.date}
            />
          );
        })}
      </div>
    </div>
  );
}
