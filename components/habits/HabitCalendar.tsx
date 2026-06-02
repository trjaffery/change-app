'use client';
import { useEffect, useState } from 'react';

function useIsCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return compact;
}

type ViewMode = 'week' | 'month';

interface HabitMeta {
  id: string;
  name: string;
  color: string;
  goal_value: number;
  goal_period: string;
}

interface CalendarData {
  habits: HabitMeta[];
  completions: Record<string, Record<string, number>>;
}

const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toISODate(d: Date) {
  return d.toISOString().split('T')[0];
}

function getDateRange(mode: ViewMode): { start: string; end: string; dates: string[] } {
  const today = new Date();
  const days = mode === 'week' ? 7 : 30;
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(toISODate(d));
  }
  return { start: dates[0], end: dates[dates.length - 1], dates };
}

function cellOpacity(count: number, goalValue: number): number {
  if (count === 0) return 0;
  return Math.min(1, count / goalValue);
}

export default function HabitCalendar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [mode, setMode] = useState<ViewMode>('week');
  const [data, setData] = useState<CalendarData | null>(null);
  const today = toISODate(new Date());
  const compact = useIsCompact();

  useEffect(() => {
    const { start, end } = getDateRange(mode);
    fetch(`/api/habits/calendar?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [mode, refreshKey]);

  const { dates } = getDateRange(mode);
  const isMonth = mode === 'month';
  // Mobile sizing keeps the week view fitting inside the card without horizontal scroll.
  // Month view still scrolls — labels stay anchored via position: sticky.
  const cellSize = compact ? (isMonth ? 18 : 28) : (isMonth ? 22 : 32);
  const cellGap  = compact ? (isMonth ? 2  : 4)  : (isMonth ? 3  : 4);
  const labelWidth = compact ? 72 : 90;

  if (!data) return <div className="card" style={{ marginBottom: 22, minHeight: 80 }} />;
  if (!data.habits.length) return null;

  return (
    <>
      <style>{`
        .cal-cell { border-radius:5px; flex-shrink:0; transition:opacity 0.2s; }
        .cal-cell.today { box-shadow:0 0 0 1.5px rgba(255,255,255,0.35); }
        .cal-toggle { padding:5px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:12px; cursor:pointer; transition:all 0.15s; }
        .cal-toggle.active { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:var(--text-primary); font-weight:600; }
        .cal-label {
          font-size: 12px; font-weight: 600; color: var(--text-secondary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          padding-left: 8px;
          display: flex; align-items: center;
        }
      `}</style>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="section-title" style={{ margin: 0 }}>Habit History</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`cal-toggle${mode === 'week' ? ' active' : ''}`} onClick={() => setMode('week')}>Week</button>
            <button className={`cal-toggle${mode === 'month' ? ' active' : ''}`} onClick={() => setMode('month')}>Month</button>
          </div>
        </div>

        {/* Two-column layout: labels never scroll (anchored), only the grid scrolls. */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {/* Labels column */}
          <div style={{ flexShrink: 0, paddingRight: 8 }}>
            {/* Header spacer — matches header row height in the grid */}
            <div style={{ height: cellSize, marginBottom: 6 }} />
            {data.habits.map(habit => (
              <div
                key={habit.id}
                title={habit.name}
                style={{
                  width: labelWidth,
                  height: cellSize,
                  marginBottom: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingLeft: 8,
                  borderLeft: `3px solid ${habit.color}`,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {habit.name}
              </div>
            ))}
          </div>

          {/* Grid column — only this scrolls horizontally */}
          <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ minWidth: dates.length * (cellSize + cellGap) }}>
              {/* Header row: day-of-week or day-of-month labels */}
              <div style={{ display: 'flex', alignItems: 'center', height: cellSize, marginBottom: 6, gap: cellGap }}>
                {dates.map(date => {
                  const d = new Date(date + 'T12:00:00Z');
                  const isToday = date === today;
                  return (
                    <div key={date} style={{ width: cellSize, flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMonth ? 9 : 10, color: isToday ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: isToday ? 700 : 400 }}>
                        {isMonth ? d.getUTCDate() : DAY_ABBR[d.getUTCDay()]}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Habit cell rows */}
              {data.habits.map(habit => {
                const habitCompletions = data.completions[habit.id] ?? {};
                return (
                  <div key={habit.id} style={{ display: 'flex', alignItems: 'center', gap: cellGap, marginBottom: 6, height: cellSize }}>
                    {dates.map(date => {
                      const count = habitCompletions[date] ?? 0;
                      const opacity = cellOpacity(count, habit.goal_value);
                      const isToday = date === today;
                      const isFuture = date > today;
                      return (
                        <div
                          key={date}
                          className={`cal-cell${isToday ? ' today' : ''}`}
                          title={count > 0 ? `${count}/${habit.goal_value}` : undefined}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            background: count > 0
                              ? `${habit.color}`
                              : 'rgba(255,255,255,0.05)',
                            opacity: count > 0 ? opacity : isFuture ? 0.2 : 0.5,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>Less</span>
          {[0.15, 0.35, 0.6, 0.8, 1].map(o => (
            <div key={o} style={{ width: 12, height: 12, borderRadius: 3, background: `rgba(255,255,255,${o * 0.6 + 0.08})` }} />
          ))}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>More</span>
        </div>
      </div>
    </>
  );
}
