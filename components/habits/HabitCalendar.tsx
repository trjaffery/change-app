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
  schedule_type: string;
  schedule_days: number[] | null;
  schedule_count: number | null;
  created_at: string | null;
}

/**
 * Is the habit "due" on a given ISO date (YYYY-MM-DD)? Mirrors the logic
 * in app/api/habits/route.ts so the calendar's denominator matches what
 * the Habits list considers a scheduled day.
 *
 *   • daily — always due
 *   • specific_days_week / specific_days_month — only on listed days
 *   • days_per_week / days_per_month — treated as "due any day" for the
 *     trailing pill, since the user picks which days to do them on. The
 *     denominator there is min(days_visible, schedule_count) so the pill
 *     reads against the period target rather than 7.
 */
function isDueOnDate(habit: HabitMeta, dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  switch (habit.schedule_type) {
    case 'specific_days_week':  return habit.schedule_days?.includes(d.getUTCDay()) ?? false;
    case 'specific_days_month': return habit.schedule_days?.includes(d.getUTCDate()) ?? false;
    default: return true;
  }
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

// 0..1 fill ratio per cell — capped at 1 so over-goal still renders as solid.
function fill(count: number, goalValue: number): number {
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

  // Month view stays a fixed-cell scrollable grid (30 cells need horizontal space).
  // Week view flexes — cells grow to fill the card so we use the whole width.
  const cellSize = compact ? (isMonth ? 18 : 24) : (isMonth ? 22 : 28);
  const cellGap  = compact ? (isMonth ? 2  : 5)  : (isMonth ? 3  : 6);
  const labelWidth = compact ? 110 : 150;
  const tailWidth  = compact ? 44 : 56;

  if (!data) return <div className="card" style={{ marginBottom: 22, minHeight: 80 }} />;
  if (!data.habits.length) return null;

  // Today's column index in the visible range — used to place the highlight band.
  const todayIdx = dates.indexOf(today);

  return (
    <>
      <style>{`
        .cal-card { margin-bottom: 22px; }
        .cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px; }
        .cal-toggle { padding:5px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:12px; cursor:pointer; transition:all 0.15s; -webkit-tap-highlight-color: transparent; }
        .cal-toggle.active { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:var(--text-primary); font-weight:600; }

        /* Row = label | grid | trailing pill. Grid grows to fill. */
        .cal-row { display: grid; align-items: center; column-gap: 10px; }
        .cal-row.week  { grid-template-columns: var(--lbl) 1fr var(--tail); }
        .cal-row.month { grid-template-columns: var(--lbl) auto var(--tail); }

        .cal-label {
          font-size: 12px; font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          padding-left: 10px; line-height: 1.2;
          border-left: 2px solid var(--row-color);
        }

        .cal-cells { display: flex; align-items: center; min-width: 0; position: relative; }
        .cal-cells.week  { gap: var(--gap); }
        .cal-cells.month { gap: var(--gap); overflow-x: auto; }

        .cal-cells.week .cal-cell  { flex: 1 1 0; min-width: 0; max-width: 56px; aspect-ratio: 1; }
        .cal-cells.month .cal-cell { width: var(--cell); height: var(--cell); flex-shrink: 0; }

        .cal-cell {
          border-radius: 6px;
          background: rgba(255,255,255,0.045);
          position: relative;
          transition: transform 140ms ease;
        }
        .cal-cell-fill {
          position: absolute; inset: 0; border-radius: inherit;
          background: var(--row-color);
          transition: opacity 200ms ease;
        }
        .cal-cell.today { box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.5); }
        .cal-cell.future { opacity: 0.45; }
        .cal-cell.off-day { background: transparent; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04); }
        .cal-cell.off-day.today { box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.3); }
        .cal-cell:hover { transform: translateY(-1px); }

        .cal-tail {
          display: inline-flex; align-items: baseline; justify-content: flex-end; gap: 3px;
          font-family: var(--font-mono); font-size: 11px;
          color: var(--text-tertiary); line-height: 1;
          text-align: right;
        }
        .cal-tail .num { color: var(--row-color); font-weight: 600; font-size: 13px; }

        /* Vertical band behind the today column — gives the column real presence
           without the cell having to carry it all. */
        .cal-today-band {
          position: absolute; top: -34px; bottom: -8px;
          border-radius: 8px;
          background: rgba(255,255,255,0.025);
          pointer-events: none;
        }

        .cal-day-head {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-tertiary);
          text-align: center;
          line-height: 1;
        }
        .cal-day-head.today { color: var(--text-primary); font-weight: 700; }

        .cal-legend {
          display: flex; align-items: center; gap: 8px;
          margin-top: 16px;
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary);
        }
      `}</style>

      <div className="card cal-card">
        <div className="cal-head">
          <div className="section-title" style={{ margin: 0 }}>Habit History</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`cal-toggle${mode === 'week' ? ' active' : ''}`} onClick={() => setMode('week')}>Week</button>
            <button className={`cal-toggle${mode === 'month' ? ' active' : ''}`} onClick={() => setMode('month')}>Month</button>
          </div>
        </div>

        {/* Header row — day-of-week (or day-of-month) labels above each cell. */}
        <div
          className={`cal-row ${mode}`}
          style={{
            ['--lbl' as string]: `${labelWidth}px`,
            ['--tail' as string]: `${tailWidth}px`,
            ['--cell' as string]: `${cellSize}px`,
            ['--gap' as string]: `${cellGap}px`,
            marginBottom: 8,
          }}
        >
          <div /> {/* label spacer */}
          <div className={`cal-cells ${mode}`} style={{ position: 'relative' }}>
            {dates.map(date => {
              const d = new Date(date + 'T12:00:00Z');
              const isToday = date === today;
              return (
                <div
                  key={date}
                  className={`cal-day-head${isToday ? ' today' : ''}`}
                  style={mode === 'week'
                    ? { flex: '1 1 0', minWidth: 0, maxWidth: 56 }
                    : { width: cellSize, flexShrink: 0 }}
                >
                  {isMonth ? d.getUTCDate() : DAY_ABBR[d.getUTCDay()]}
                </div>
              );
            })}
          </div>
          <div className="cal-tail" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            hit
          </div>
        </div>

        {/* Habit rows */}
        {data.habits.map(habit => {
          const habitCompletions = data.completions[habit.id] ?? {};
          const createdAt = (habit.created_at ?? '').split('T')[0];

          // A date counts toward the denominator only if the habit was already
          // created AND scheduled on that day. For "N days per week/month" we
          // use schedule_count as a cap so the pill reads against the period
          // target rather than a calendar denominator.
          const eligibleDates = dates.filter(d =>
            d <= today
            && (!createdAt || d >= createdAt)
            && isDueOnDate(habit, d),
          );
          const daysHit = eligibleDates.reduce(
            (sum, d) => sum + ((habitCompletions[d] ?? 0) >= habit.goal_value ? 1 : 0), 0);
          let daysVisible = eligibleDates.length;
          if ((habit.schedule_type === 'days_per_week' || habit.schedule_type === 'days_per_month') && habit.schedule_count) {
            daysVisible = Math.min(daysVisible, habit.schedule_count);
          }

          return (
            <div
              key={habit.id}
              className={`cal-row ${mode}`}
              style={{
                ['--lbl' as string]: `${labelWidth}px`,
                ['--tail' as string]: `${tailWidth}px`,
                ['--cell' as string]: `${cellSize}px`,
                ['--gap' as string]: `${cellGap}px`,
                ['--row-color' as string]: habit.color,
                marginBottom: 6,
              }}
            >
              <div className="cal-label" title={habit.name}>{habit.name}</div>
              <div className={`cal-cells ${mode}`}>
                {dates.map(date => {
                  const count = habitCompletions[date] ?? 0;
                  const opacity = fill(count, habit.goal_value);
                  const isToday = date === today;
                  const isFuture = date > today;
                  const isDue = isDueOnDate(habit, date);
                  // "Off day" — habit isn't scheduled that day. Render a barely-
                  // there cell so the row stays aligned but reads as not-applicable.
                  if (!isDue) {
                    return (
                      <div
                        key={date}
                        className={`cal-cell off-day${isToday ? ' today' : ''}`}
                        title={`Not scheduled — ${date}`}
                      />
                    );
                  }
                  return (
                    <div
                      key={date}
                      className={`cal-cell${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`}
                      title={count > 0 ? `${count}/${habit.goal_value} on ${date}` : date}
                    >
                      {opacity > 0 && <div className="cal-cell-fill" style={{ opacity }} />}
                    </div>
                  );
                })}
              </div>
              <div className="cal-tail">
                <span className="num">{daysHit}</span>
                <span>/{daysVisible}</span>
              </div>
            </div>
          );
        })}

        <div className="cal-legend">
          <span>none</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0, 0.4, 0.75, 1].map(o => (
              <div key={o} style={{
                width: 11, height: 11, borderRadius: 3,
                background: o === 0 ? 'rgba(255,255,255,0.045)' : `rgba(107,227,164,${o})`,
                border: o === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }} />
            ))}
          </div>
          <span>goal hit</span>
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
            opacity = count / goal
          </span>
        </div>
      </div>
    </>
  );
}
