'use client';
import { useEffect, useState } from 'react';

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
  const dates: string[] = [];

  if (mode === 'week') {
    const dow = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      dates.push(toISODate(d));
    }
  } else {
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(toISODate(new Date(year, month, d)));
    }
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

  useEffect(() => {
    const { start, end } = getDateRange(mode);
    fetch(`/api/habits/calendar?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(setData);
  }, [mode, refreshKey]);

  const { dates } = getDateRange(mode);
  const isMonth = mode === 'month';
  const cellSize = isMonth ? 24 : 34;
  const cellGap = isMonth ? 3 : 4;
  const labelWidth = 110;

  if (!data) return <div className="card" style={{ marginBottom: 22, minHeight: 80 }} />;
  if (!data.habits.length) return null;

  return (
    <>
      <style>{`
        .cal-cell { border-radius:5px; flex-shrink:0; transition:opacity 0.2s; }
        .cal-cell.today { box-shadow:0 0 0 1.5px rgba(255,255,255,0.35); }
        .cal-toggle { padding:5px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:12px; cursor:pointer; transition:all 0.15s; }
        .cal-toggle.active { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:var(--text-primary); font-weight:600; }
      `}</style>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="section-title" style={{ margin: 0 }}>Habit History</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`cal-toggle${mode === 'week' ? ' active' : ''}`} onClick={() => setMode('week')}>Week</button>
            <button className={`cal-toggle${mode === 'month' ? ' active' : ''}`} onClick={() => setMode('month')}>Month</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ minWidth: labelWidth + dates.length * (cellSize + cellGap) }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: cellGap }}>
              <div style={{ width: labelWidth, flexShrink: 0 }} />
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

            {/* Habit rows */}
            {data.habits.map(habit => {
              const habitCompletions = data.completions[habit.id] ?? {};
              return (
                <div key={habit.id} style={{ display: 'flex', alignItems: 'center', gap: cellGap, marginBottom: 6 }}>
                  <div style={{ width: labelWidth, flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8, borderLeft: `3px solid ${habit.color}`, paddingLeft: 8 }}>
                    {habit.name}
                  </div>
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
                          opacity: count > 0 ? Math.max(0.15, opacity) : isFuture ? 0.2 : 0.5,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
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
