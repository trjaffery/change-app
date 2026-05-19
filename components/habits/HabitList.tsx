'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString, toDateString, formatDate } from '@/lib/dates';

interface Habit {
  id: string;
  name: string;
  color: string;
  streak: number;
  period_done: number;
  is_complete: boolean;
  goal_period: 'day' | 'week' | 'month';
  goal_value: number;
  schedule_type: string;
}

const PRESET_COLORS = [
  '#6BE3A4', '#F2C063', '#FF6B6B', '#5B9FE8',
  '#B07FE8', '#4ECCD8', '#E87FB0', '#F28C4E',
];

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const PERIOD_LABEL: Record<string, string> = { day: 'day', week: 'week', month: 'month' };

function periodLabel(habit: Habit): string {
  if (habit.goal_period === 'day') return 'today';
  if (habit.goal_period === 'week') return 'this week';
  return 'this month';
}

export default function HabitList({ onCompletionChange }: { onCompletionChange?: (done: number, total: number) => void }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [adding, setAdding] = useState(false);
  const today = getActiveDateString();
  const [selectedDate, setSelectedDate] = useState(today);

  function goBack() {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(toDateString(d));
  }
  function goForward() {
    if (selectedDate >= today) return;
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(toDateString(d));
  }
  const isToday = selectedDate === today;

  // Form state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [scheduleType, setScheduleType] = useState<'daily' | 'specific_days_week' | 'days_per_week' | 'specific_days_month' | 'days_per_month'>('daily');
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleCount, setScheduleCount] = useState(3);
  const [goalPeriod, setGoalPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [goalValue, setGoalValue] = useState(1);

  const onCompletionChangeRef = useRef(onCompletionChange);
  onCompletionChangeRef.current = onCompletionChange;

  const fetchHabits = useCallback(async () => {
    try {
      const res = await fetch(`/api/habits?date=${selectedDate}`);
      const data: Habit[] = await res.json();
      setHabits(data);
      if (isToday) onCompletionChangeRef.current?.(data.filter(h => h.is_complete).length, data.length);
    } catch {}
  }, [selectedDate, isToday]);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  function optimisticUpdate(habitId: string, delta: 1 | -1) {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== habitId) return h;
        const newDone = Math.max(0, h.period_done + delta);
        return { ...h, period_done: newDone, is_complete: newDone >= h.goal_value };
      });
      if (isToday) onCompletionChangeRef.current?.(next.filter(h => h.is_complete).length, next.length);
      return next;
    });
  }

  async function increment(habit: Habit) {
    optimisticUpdate(habit.id, 1);
    try {
      await fetch('/api/habits/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habit.id, date: selectedDate }),
      });
    } catch { fetchHabits(); }
  }

  async function decrement(habit: Habit) {
    if (habit.period_done === 0) return;
    optimisticUpdate(habit.id, -1);
    try {
      await fetch('/api/habits/completions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habit.id, date: selectedDate }),
      });
    } catch { fetchHabits(); }
  }

  async function addHabit() {
    if (!newName.trim()) return;
    const body: Record<string, unknown> = {
      name: newName.trim(),
      color: newColor,
      schedule_type: scheduleType,
      goal_period: goalPeriod,
      goal_value: goalValue,
    };
    if (scheduleType === 'specific_days_week' || scheduleType === 'specific_days_month') {
      body.schedule_days = scheduleDays;
    }
    if (scheduleType === 'days_per_week' || scheduleType === 'days_per_month') {
      body.schedule_count = scheduleCount;
    }
    await fetch('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setNewName('');
    setScheduleType('daily');
    setScheduleDays([]);
    setScheduleCount(3);
    setGoalPeriod('day');
    setGoalValue(1);
    setAdding(false);
    fetchHabits();
  }

  function toggleScheduleDay(d: number) {
    setScheduleDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  async function deleteHabit(id: string) {
    if (!confirm('Delete this habit? All history will be lost.')) return;
    await fetch(`/api/habits/${id}`, { method: 'DELETE' });
    fetchHabits();
  }

  return (
    <>
      <style>{`
        .habit-row { display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); transition:background 0.2s, border-color 0.2s; }
        .habit-row.done { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.09); }
        .habit-check { width:30px; height:30px; border-radius:50%; border:2px solid; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; flex-shrink:0; background:transparent; }
        .habit-delete { background:none; border:none; color:var(--text-tertiary); cursor:pointer; font-size:18px; padding:0 4px; opacity:0; transition:opacity 0.15s; flex-shrink:0; line-height:1; }
        .habit-row:hover .habit-delete { opacity:0.4; }
        .habit-delete:hover { opacity:1 !important; color:var(--danger); }
        .color-swatch { width:26px; height:26px; border-radius:50%; cursor:pointer; border:3px solid transparent; transition:border-color 0.15s; flex-shrink:0; padding:0; }
        .color-swatch.selected { border-color:white; }
        .seg-btn { padding:6px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:12px; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
        .seg-btn.active { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:var(--text-primary); font-weight:600; }
        .day-btn { width:32px; height:32px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:11px; font-weight:600; cursor:pointer; transition:all 0.15s; }
        .day-btn.active { border-color:rgba(255,255,255,0.25); color:var(--text-primary); }
        .progress-bar-track { flex:1; height:4px; border-radius:2px; background:rgba(255,255,255,0.08); overflow:hidden; }
        .count-btn { width:28px; height:28px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:transparent; color:var(--text-secondary); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; flex-shrink:0; }
        .count-btn:hover { border-color:rgba(255,255,255,0.25); color:var(--text-primary); }
        .count-btn:disabled { opacity:0.25; cursor:default; }
        .form-label { font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-tertiary); margin-bottom:8px; }
      `}</style>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (habits.length > 0 || adding) ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>Habits</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={goBack} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>‹</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isToday ? 'var(--text-secondary)' : 'var(--text-primary)', minWidth: 80, textAlign: 'center' }}>
                {isToday ? 'Today' : formatDate(selectedDate)}
              </span>
              <button onClick={goForward} disabled={isToday} style={{ background: 'none', border: 'none', color: isToday ? 'transparent' : 'var(--text-tertiary)', cursor: isToday ? 'default' : 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>›</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {habits.length > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                {habits.filter(h => h.is_complete).length}/{habits.length} done
              </span>
            )}
            {isToday && (
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setAdding(a => !a)}>
                {adding ? 'Cancel' : '+ Add habit'}
              </button>
            )}
          </div>
        </div>

        {adding && (
          <div style={{ marginBottom: 16, padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name + Color */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="text-input"
                type="text"
                placeholder="Habit name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addHabit()}
                autoFocus
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} className={`color-swatch${newColor === c ? ' selected' : ''}`} onClick={() => setNewColor(c)} style={{ background: c }} />
              ))}
            </div>

            {/* Schedule */}
            <div>
              <div className="form-label">Schedule</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['daily', 'specific_days_week', 'days_per_week', 'specific_days_month', 'days_per_month'] as const).map(type => (
                  <button key={type} className={`seg-btn${scheduleType === type ? ' active' : ''}`} onClick={() => setScheduleType(type)}>
                    {type === 'daily' ? 'Every day'
                      : type === 'specific_days_week' ? 'Specific days'
                      : type === 'days_per_week' ? 'X days/week'
                      : type === 'specific_days_month' ? 'Specific dates'
                      : 'X days/month'}
                  </button>
                ))}
              </div>

              {scheduleType === 'specific_days_week' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {DAYS_SHORT.map((d, i) => (
                    <button key={d} className={`day-btn${scheduleDays.includes(i) ? ' active' : ''}`}
                      onClick={() => toggleScheduleDay(i)}
                      style={{ background: scheduleDays.includes(i) ? `${newColor}22` : 'transparent', borderColor: scheduleDays.includes(i) ? newColor : undefined, color: scheduleDays.includes(i) ? newColor : undefined }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {scheduleType === 'days_per_week' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <input type="number" min={1} max={7} value={scheduleCount} onChange={e => setScheduleCount(Number(e.target.value))} className="text-input" style={{ width: 64, padding: '8px 12px' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>days per week</span>
                </div>
              )}

              {scheduleType === 'specific_days_month' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <button key={d} className={`day-btn${scheduleDays.includes(d) ? ' active' : ''}`}
                      onClick={() => toggleScheduleDay(d)}
                      style={{ width: 36, fontSize: 11, background: scheduleDays.includes(d) ? `${newColor}22` : 'transparent', borderColor: scheduleDays.includes(d) ? newColor : undefined, color: scheduleDays.includes(d) ? newColor : undefined }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {scheduleType === 'days_per_month' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <input type="number" min={1} max={31} value={scheduleCount} onChange={e => setScheduleCount(Number(e.target.value))} className="text-input" style={{ width: 64, padding: '8px 12px' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>days per month</span>
                </div>
              )}
            </div>

            {/* Goal */}
            <div>
              <div className="form-label">Goal</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['day', 'week', 'month'] as const).map(p => (
                    <button key={p} className={`seg-btn${goalPeriod === p ? ' active' : ''}`} onClick={() => setGoalPeriod(p)}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={1} value={goalValue} onChange={e => setGoalValue(Math.max(1, Number(e.target.value)))} className="text-input" style={{ width: 64, padding: '8px 12px' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>× per {PERIOD_LABEL[goalPeriod]}</span>
                </div>
              </div>
            </div>

            <div>
              <button className="btn-primary" style={{ padding: '10px 20px', fontSize: 13 }} onClick={addHabit}>Add habit</button>
            </div>
          </div>
        )}

        {habits.length === 0 && !adding && (
          <div className="empty-state">No habits yet — add one to start tracking.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {habits.map(habit => {
            const pct = habit.goal_value > 0 ? Math.min(1, habit.period_done / habit.goal_value) : 0;
            const isGoalOne = habit.goal_value === 1;

            return (
              <div key={habit.id} className={`habit-row${habit.is_complete ? ' done' : ''}`} style={{ borderLeft: `3px solid ${habit.color}` }}>
                {isGoalOne ? (
                  <button className="habit-check" onClick={() => habit.is_complete ? decrement(habit) : increment(habit)}
                    style={{ borderColor: habit.color, background: habit.is_complete ? habit.color : 'transparent' }}>
                    {habit.is_complete && (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 6.5L5.2 9.5L11 3.5" stroke="#050506" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ) : (
                  <button className="count-btn" onClick={() => decrement(habit)} disabled={habit.period_done === 0}>−</button>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: !isGoalOne ? 6 : 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: habit.is_complete ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: habit.is_complete ? 'line-through' : 'none', transition: 'all 0.2s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {habit.name}
                    </div>
                    {!isGoalOne && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: habit.is_complete ? habit.color : 'var(--text-secondary)', flexShrink: 0 }}>
                        {habit.period_done}/{habit.goal_value}
                      </span>
                    )}
                  </div>

                  {!isGoalOne && (
                    <div className="progress-bar-track">
                      <div style={{ height: '100%', borderRadius: 2, background: habit.color, width: `${pct * 100}%`, transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)' }} />
                    </div>
                  )}

                  {habit.streak > 0 && isGoalOne && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {habit.streak} day streak
                    </div>
                  )}
                  {!isGoalOne && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {periodLabel(habit)}{habit.streak > 0 ? ` · ${habit.streak} day streak` : ''}
                    </div>
                  )}
                </div>

                {!isGoalOne && (
                  <button className="count-btn" onClick={() => increment(habit)} style={{ borderColor: habit.is_complete ? habit.color : undefined }}>+</button>
                )}
                <button className="habit-delete" onClick={() => deleteHabit(habit.id)}>×</button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
