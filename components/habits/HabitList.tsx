'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, GripVertical } from 'lucide-react';
import { getActiveDateString, toDateString, formatDate } from '@/lib/dates';
import BottomSheet from '@/components/layout/BottomSheet';
import { useToast } from '@/components/layout/Toast';
import RemindersField from '@/components/habits/RemindersField';

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
  schedule_days: number[] | null;
  schedule_count: number | null;
  reminder_time: string | null;        // legacy 'HH:MM:SS'
  reminder_times: string[] | null;     // new: array of 'HH:MM:SS' strings
}

type ScheduleType = 'daily' | 'specific_days_week' | 'days_per_week' | 'specific_days_month' | 'days_per_month';
const ACTION_WIDTH = 128;

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

export default function HabitList({
  onCompletionChange,
  onCompletionPersisted,
}: {
  onCompletionChange?: (done: number, total: number) => void;
  onCompletionPersisted?: () => void;
}) {
  const toast = useToast();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [adding, setAdding] = useState(false);
  const [addStep, setAddStep] = useState(0); // 0 = name+color, 1 = schedule, 2 = goal
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
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleCount, setScheduleCount] = useState(3);
  const [goalPeriod, setGoalPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [goalValue, setGoalValue] = useState(1);
  // Array of 'HH:MM' strings — empty = no reminders. Replaces the legacy
  // single reminder_time; the API still accepts both for back-compat.
  const [reminderTimes, setReminderTimes] = useState<string[]>([]);

  // Edit state — single sheet, single-page form
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [editScheduleType, setEditScheduleType] = useState<ScheduleType>('daily');
  const [editScheduleDays, setEditScheduleDays] = useState<number[]>([]);
  const [editScheduleCount, setEditScheduleCount] = useState(3);
  const [editGoalPeriod, setEditGoalPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [editGoalValue, setEditGoalValue] = useState(1);
  const [editReminderTimes, setEditReminderTimes] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Gesture: each row supports three pointer interactions, disambiguated by a
  // small state machine kept entirely in a ref so pointermove never re-renders.
  //   • Quick tap on +/− or check button → button onClick fires normally
  //   • Horizontal pointer drag (>8px, dx > dy) → swipe-to-reveal Edit/Delete
  //   • Long-press (320ms, no movement) → enter drag-reorder mode
  //   • Vertical drag before any of the above → bail (native scroll)
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gestureRef = useRef<null | {
    id: string;
    startX: number; startY: number;
    state: 'pending' | 'swiping' | 'reordering' | 'cancelled';
    baseOffset: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    initialIdx: number;
    rowHeight: number;
  }>(null);

  const onCompletionChangeRef = useRef(onCompletionChange);
  useEffect(() => { onCompletionChangeRef.current = onCompletionChange; }, [onCompletionChange]);
  const onCompletionPersistedRef = useRef(onCompletionPersisted);
  useEffect(() => { onCompletionPersistedRef.current = onCompletionPersisted; }, [onCompletionPersisted]);

  const fetchHabits = useCallback(async () => {
    try {
      const res = await fetch(`/api/habits?date=${selectedDate}`);
      const data: Habit[] = await res.json();
      setHabits(data);
      if (isToday) onCompletionChangeRef.current?.(data.filter(h => h.is_complete).length, data.length);
    } catch {}
  }, [selectedDate, isToday]);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  // Phase 2 #11: HabitCoach can dispatch a 'habit-prefill' event with a
  // suggested name; we open the add sheet pre-filled at step 0.
  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) {
        setNewName(detail.name);
        setAddStep(0);
        setAdding(true);
      }
    }
    window.addEventListener('habit-prefill', onPrefill);
    return () => window.removeEventListener('habit-prefill', onPrefill);
  }, []);

  function optimisticUpdate(habitId: string, delta: 1 | -1) {
    // Compute `next` outside the updater so we can also notify the parent without
    // running setState-from-render-of-another-component (React 19 flags that).
    const next = habits.map(h => {
      if (h.id !== habitId) return h;
      const newDone = Math.max(0, h.period_done + delta);
      return { ...h, period_done: newDone, is_complete: newDone >= h.goal_value };
    });
    setHabits(next);
    if (isToday) onCompletionChangeRef.current?.(next.filter(h => h.is_complete).length, next.length);
  }

  async function increment(habit: Habit) {
    optimisticUpdate(habit.id, 1);
    try {
      const res = await fetch('/api/habits/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habit.id, date: selectedDate }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Only signal dependent views (calendar) AFTER the write is durable —
      // otherwise the calendar refetches mid-flight and misses the new
      // completion (the "history doesn't show today" bug).
      onCompletionPersistedRef.current?.();
    } catch {
      toast({ kind: 'error', message: "Couldn't save — try again" });
      fetchHabits();
    }
  }

  async function decrement(habit: Habit) {
    if (habit.period_done === 0) return;
    optimisticUpdate(habit.id, -1);
    try {
      const res = await fetch('/api/habits/completions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habit.id, date: selectedDate }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCompletionPersistedRef.current?.();
    } catch {
      toast({ kind: 'error', message: "Couldn't save — try again" });
      fetchHabits();
    }
  }

  async function addHabit() {
    if (!newName.trim()) return;
    const body: Record<string, unknown> = {
      name: newName.trim(),
      color: newColor,
      schedule_type: scheduleType,
      goal_period: goalPeriod,
      goal_value: goalValue,
      // Keep legacy reminder_time in sync (first entry) so back-compat code paths still work.
      reminder_time: reminderTimes[0] || null,
      reminder_times: reminderTimes.length ? reminderTimes : null,
    };
    if (scheduleType === 'specific_days_week' || scheduleType === 'specific_days_month') {
      body.schedule_days = scheduleDays;
    }
    if (scheduleType === 'days_per_week' || scheduleType === 'days_per_month') {
      body.schedule_count = scheduleCount;
    }
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewName('');
      setScheduleType('daily');
      setScheduleDays([]);
      setScheduleCount(3);
      setGoalPeriod('day');
      setGoalValue(1);
      setReminderTimes([]);
      setAddStep(0);
      setAdding(false);
      fetchHabits();
    } catch {
      toast({ kind: 'error', message: "Couldn't add habit" });
    }
  }

  function openAdd() {
    setAddStep(0);
    setAdding(true);
  }
  function closeAdd() {
    setAdding(false);
    // Don't reset the in-progress fields; user might re-open and continue.
  }

  function toggleScheduleDay(d: number) {
    setScheduleDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  async function deleteHabit(id: string) {
    if (!confirm('Delete this habit? All history will be lost.')) return;
    try {
      const res = await fetch(`/api/habits/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRevealedId(null);
      fetchHabits();
    } catch {
      toast({ kind: 'error', message: "Couldn't delete habit" });
    }
  }

  function startEdit(habit: Habit) {
    setEditId(habit.id);
    setEditName(habit.name);
    setEditColor(habit.color);
    setEditScheduleType(habit.schedule_type as ScheduleType);
    setEditScheduleDays(habit.schedule_days ?? []);
    setEditScheduleCount(habit.schedule_count ?? 3);
    setEditGoalPeriod(habit.goal_period);
    setEditGoalValue(habit.goal_value);
    // DB stores 'HH:MM:SS'; <input type="time"> wants 'HH:MM'. Prefer the new
    // reminder_times array; fall back to the legacy single field if it's the
    // only thing set on older habits.
    const arr = habit.reminder_times ?? (habit.reminder_time ? [habit.reminder_time] : []);
    setEditReminderTimes(arr.map(t => t.slice(0, 5)));
    setRevealedId(null);
  }
  function cancelEdit() { setEditId(null); }
  async function saveEdit() {
    if (!editId || !editName.trim() || editSaving) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        color: editColor,
        schedule_type: editScheduleType,
        goal_period: editGoalPeriod,
        goal_value: editGoalValue,
        // Wipe schedule fields that don't apply to the current type so they don't
        // linger as stale data and confuse the AI/stats next time we read them.
        schedule_days: (editScheduleType === 'specific_days_week' || editScheduleType === 'specific_days_month') ? editScheduleDays : null,
        schedule_count: (editScheduleType === 'days_per_week' || editScheduleType === 'days_per_month') ? editScheduleCount : null,
        reminder_time: editReminderTimes[0] || null,
        reminder_times: editReminderTimes.length ? editReminderTimes : null,
      };
      const res = await fetch(`/api/habits/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cancelEdit();
      fetchHabits();
    } catch {
      toast({ kind: 'error', message: "Couldn't save habit changes" });
    } finally { setEditSaving(false); }
  }
  function toggleEditScheduleDay(d: number) {
    setEditScheduleDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  // Direct-DOM transform writer. Avoids React re-renders during drag/swipe.
  function setRowTransform(id: string, value: string, options: { transition?: string } = {}) {
    const el = rowRefs.current.get(id);
    if (!el) return;
    if (options.transition !== undefined) el.style.transition = options.transition;
    el.style.transform = value;
  }

  function enterReorderMode(habitId: string, pointerId: number) {
    const g = gestureRef.current;
    if (!g || g.state !== 'pending' || g.id !== habitId) return;
    g.state = 'reordering';
    g.longPressTimer = null;
    const el = rowRefs.current.get(habitId);
    if (!el) return;
    el.setPointerCapture(pointerId);
    // Close any other swipe-revealed row before lifting this one.
    if (revealedId && revealedId !== habitId) {
      setRowTransform(revealedId, '', { transition: '' });
      setRevealedId(null);
    } else if (revealedId === habitId) {
      // Was swiped open; snap back so the row starts at home position.
      setRevealedId(null);
    }
    setRowTransform(habitId, 'translateY(0) scale(1.02)', { transition: 'none' });
    el.classList.add('reordering');
    setDraggedId(habitId);
    setDropIndex(g.initialIdx);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(15); } catch { /* not all browsers honour vibrate */ }
    }
  }

  function onRowPointerDown(e: React.PointerEvent<HTMLDivElement>, habitId: string, idx: number) {
    if ((e.target as HTMLElement).closest('[data-no-swipe]')) return;
    const rowEl = rowRefs.current.get(habitId);
    if (!rowEl) return;
    const baseOffset = revealedId === habitId ? -ACTION_WIDTH : 0;
    const pointerId = e.pointerId;
    // Touch on the drag handle → skip the long-press wait and enter reorder mode
    // immediately. The handle's `touch-action: none` keeps the browser from
    // stealing the gesture for page scroll.
    const fromHandle = !!(e.target as HTMLElement).closest('[data-drag-handle]');
    const longPressTimer = fromHandle
      ? null
      : setTimeout(() => enterReorderMode(habitId, pointerId), 320);
    gestureRef.current = {
      id: habitId,
      startX: e.clientX, startY: e.clientY,
      state: 'pending',
      baseOffset,
      longPressTimer,
      initialIdx: idx,
      rowHeight: rowEl.getBoundingClientRect().height,
    };
    if (fromHandle) enterReorderMode(habitId, pointerId);
  }

  function onRowPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.state === 'pending') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        if (g.longPressTimer) { clearTimeout(g.longPressTimer); g.longPressTimer = null; }
        g.state = 'swiping';
        const el = rowRefs.current.get(g.id);
        if (el) { el.style.transition = 'none'; el.setPointerCapture(e.pointerId); }
      } else if (Math.abs(dy) > 8) {
        if (g.longPressTimer) { clearTimeout(g.longPressTimer); g.longPressTimer = null; }
        g.state = 'cancelled';
      } else {
        return;
      }
    }

    if (g.state === 'swiping') {
      const next = Math.max(-ACTION_WIDTH - 16, Math.min(0, g.baseOffset + dx));
      setRowTransform(g.id, `translateX(${next}px)`);
    }

    if (g.state === 'reordering') {
      // Belt + braces: prevent the browser from interpreting subsequent vertical
      // movement as page scroll (CSS touch-action: none on the dragged row also
      // covers this, but some mobile browsers commit to pan-y before the
      // touch-action change applies).
      if (e.cancelable) e.preventDefault();
      setRowTransform(g.id, `translateY(${dy}px) scale(1.02)`);
      const slotShift = Math.round(dy / Math.max(1, g.rowHeight));
      const targetIdx = Math.max(0, Math.min(habits.length - 1, g.initialIdx + slotShift));
      setDropIndex(prev => prev === targetIdx ? prev : targetIdx);
    }
  }

  function onRowPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g) { return; }
    if (g.longPressTimer) { clearTimeout(g.longPressTimer); g.longPressTimer = null; }

    if (g.state === 'swiping') {
      const dx = e.clientX - g.startX;
      const final = g.baseOffset + dx;
      const open = final < -ACTION_WIDTH / 2;
      const el = rowRefs.current.get(g.id);
      if (el) {
        el.style.transition = '';
        el.style.transform = open ? `translateX(${-ACTION_WIDTH}px)` : '';
      }
      setRevealedId(open ? g.id : null);
    } else if (g.state === 'reordering') {
      const el = rowRefs.current.get(g.id);
      if (el) {
        el.classList.remove('reordering');
        el.style.transition = '';
        el.style.transform = '';
      }
      const target = dropIndex ?? g.initialIdx;
      if (target !== g.initialIdx) commitReorder(g.id, g.initialIdx, target);
      setDraggedId(null);
      setDropIndex(null);
    }
    gestureRef.current = null;
  }

  async function commitReorder(id: string, from: number, to: number) {
    const next = [...habits];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setHabits(next);
    // PATCH each habit's new position in parallel. Server keeps its own
    // canonical sort by position; the next fetch will rehydrate from there.
    await Promise.all(next.map((h, i) => fetch(`/api/habits/${h.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: i }),
    })));
  }

  // Close revealed row when clicking elsewhere on the page.
  useEffect(() => {
    if (!revealedId) return;
    const openId: string = revealedId;
    function onDocPointer(e: PointerEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest(`[data-habit-wrap="${openId}"]`)) {
        setRowTransform(openId, '', { transition: '' });
        setRevealedId(null);
      }
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedId]);


  return (
    <>
      <style>{`
        .habit-row-wrap { position: relative; border-radius: 12px; overflow: hidden; touch-action: pan-y; }
        .habit-row-wrap.dragging { overflow: visible; touch-action: none; }
        .habit-row { position: relative; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; background-color: rgba(20,20,22,1); border: 1px solid rgba(255,255,255,0.05); transition: transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms ease, background 0.2s, border-color 0.2s; will-change: transform; user-select: none; -webkit-user-select: none; cursor: grab; touch-action: pan-y; }
        .habit-row:active { cursor: grabbing; }
        .habit-row.done { background-color: rgba(28,28,30,1); border-color: rgba(255,255,255,0.09); }
        .habit-row.reordering { z-index: 20; box-shadow: 0 14px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08); cursor: grabbing; touch-action: none; }
        .habit-drop-indicator { height: 0; border-top: 2px solid var(--success); margin: 3px 6px; border-radius: 1px; pointer-events: none; box-shadow: 0 0 10px rgba(107,227,164,0.4); animation: drop-pulse 1.2s ease-in-out infinite; }
        /* Drag handle — touch-action: none so iOS doesn't steal the gesture
           for page scroll before our pointermove fires. Tap target is at least
           28px wide for finger-friendliness. */
        .habit-drag-handle { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 36px; margin-right: -6px; color: var(--text-tertiary); cursor: grab; flex-shrink: 0; touch-action: none; -webkit-tap-highlight-color: transparent; opacity: 0.55; transition: opacity 160ms ease, color 160ms ease; }
        .habit-drag-handle:hover { opacity: 1; color: var(--text-secondary); }
        .habit-drag-handle:active { cursor: grabbing; opacity: 1; }
        @keyframes drop-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        .habit-actions { position: absolute; top: 0; bottom: 0; right: 0; width: ${ACTION_WIDTH}px; display: flex; align-items: stretch; gap: 4px; padding: 4px 4px 4px 0; z-index: 1; }
        .habit-action-btn { flex: 1; border-radius: 10px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; -webkit-tap-highlight-color: transparent; transition: filter 160ms ease; gap: 4px; flex-direction: column; }
        .habit-action-btn.edit { background: rgba(91,159,232,0.16); color: #78B4FF; border: 1px solid rgba(91,159,232,0.3); }
        .habit-action-btn.delete { background: rgba(255,107,107,0.16); color: var(--danger); border: 1px solid rgba(255,107,107,0.3); }
        .habit-action-btn:hover { filter: brightness(1.15); }
        .habit-check { width: 36px; height: 36px; border-radius: 50%; border: 2px solid; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; background: transparent; }
        .color-swatch { width:26px; height:26px; border-radius:50%; cursor:pointer; border:3px solid transparent; transition:border-color 0.15s; flex-shrink:0; padding:0; }
        .color-swatch.selected { border-color:white; }
        .seg-btn { padding:6px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:12px; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
        .seg-btn.active { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); color:var(--text-primary); font-weight:600; }
        .day-btn { width:32px; height:32px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:11px; font-weight:600; cursor:pointer; transition:all 0.15s; }
        .day-btn.active { border-color:rgba(255,255,255,0.25); color:var(--text-primary); }
        .progress-bar-track { flex:1; height:4px; border-radius:2px; background:rgba(255,255,255,0.08); overflow:hidden; }
        .count-btn { width: 40px; height: 40px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); color: var(--text-secondary); font-size: 20px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0; -webkit-tap-highlight-color: transparent; line-height: 1; }
        .count-btn:hover { border-color: rgba(255,255,255,0.3); color: var(--text-primary); background: rgba(255,255,255,0.06); }
        .count-btn:active { transform: scale(0.94); }
        .count-btn:disabled { opacity: 0.25; cursor: default; }
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
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={openAdd}>
                + Add habit
              </button>
            )}
          </div>
        </div>

        <BottomSheet open={adding} onClose={closeAdd} title="New habit">
          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: i === addStep ? 22 : 6,
                height: 6,
                borderRadius: 3,
                background: i <= addStep ? newColor : 'rgba(255,255,255,0.12)',
                transition: 'width 220ms ease, background 220ms ease',
              }} />
            ))}
          </div>

          {/* Step 0: Name + color */}
          {addStep === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div className="form-label" style={{ marginBottom: 8 }}>Name</div>
                <input
                  className="text-input"
                  type="text"
                  placeholder="e.g. Salah, Read, Walk"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) setAddStep(1); }}
                  autoFocus
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <div className="form-label" style={{ marginBottom: 8 }}>Accent color</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c} className={`color-swatch${newColor === c ? ' selected' : ''}`} onClick={() => setNewColor(c)} style={{ background: c, width: 32, height: 32 }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Schedule */}
          {addStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="form-label" style={{ marginBottom: 8 }}>How often</div>
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
              </div>

              {scheduleType === 'specific_days_week' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" min={1} max={7} value={scheduleCount} onChange={e => setScheduleCount(Number(e.target.value))} className="text-input" style={{ width: 72 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>days per week</span>
                </div>
              )}

              {scheduleType === 'specific_days_month' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" min={1} max={31} value={scheduleCount} onChange={e => setScheduleCount(Number(e.target.value))} className="text-input" style={{ width: 72 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>days per month</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Goal */}
          {addStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="form-label" style={{ marginBottom: 8 }}>Goal</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={1}
                    value={goalValue}
                    onChange={e => setGoalValue(Math.max(1, Number(e.target.value)))}
                    className="text-input"
                    style={{ width: 80, textAlign: 'center', fontSize: 22, fontWeight: 700, padding: '14px' }}
                  />
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>× per</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['day', 'week', 'month'] as const).map(p => (
                      <button key={p} className={`seg-btn${goalPeriod === p ? ' active' : ''}`} onClick={() => setGoalPeriod(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <RemindersField
                times={reminderTimes}
                onChange={setReminderTimes}
                goalValue={goalPeriod === 'day' ? goalValue : 1}
              />
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Summary</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: newColor, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{newName || 'Untitled'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {scheduleType === 'daily' ? 'Every day' :
                   scheduleType === 'specific_days_week' ? `${scheduleDays.map(d => DAYS_SHORT[d]).join(', ') || 'pick days'}` :
                   scheduleType === 'days_per_week' ? `${scheduleCount} day${scheduleCount !== 1 ? 's' : ''}/week` :
                   scheduleType === 'specific_days_month' ? `${scheduleDays.length ? scheduleDays.join(', ') : 'pick dates'} of month` :
                   `${scheduleCount} day${scheduleCount !== 1 ? 's' : ''}/month`}
                  {' · '}{goalValue}× per {PERIOD_LABEL[goalPeriod]}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 22 }}>
            <button
              className="btn-secondary"
              style={{ fontSize: 13 }}
              onClick={() => addStep === 0 ? closeAdd() : setAddStep(s => s - 1)}
            >
              {addStep === 0 ? 'Cancel' : 'Back'}
            </button>
            {addStep < 2 ? (
              <button
                className="btn-primary"
                style={{ fontSize: 13 }}
                disabled={addStep === 0 && !newName.trim()}
                onClick={() => setAddStep(s => s + 1)}
              >
                Continue
              </button>
            ) : (
              <button
                className="btn-primary"
                style={{ fontSize: 13 }}
                disabled={!newName.trim()}
                onClick={addHabit}
              >
                Add habit
              </button>
            )}
          </div>
        </BottomSheet>

        <BottomSheet open={editId !== null} onClose={() => !editSaving && cancelEdit()} title="Edit habit" disableBackdropClose={editSaving}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div className="form-label" style={{ marginBottom: 8 }}>Name</div>
              <input
                className="text-input"
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && editName.trim()) saveEdit(); }}
                style={{ width: '100%' }}
                autoFocus
              />
            </div>

            <div>
              <div className="form-label" style={{ marginBottom: 8 }}>Accent color</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} className={`color-swatch${editColor === c ? ' selected' : ''}`} onClick={() => setEditColor(c)} style={{ background: c, width: 32, height: 32 }} />
                ))}
              </div>
            </div>

            <div>
              <div className="form-label" style={{ marginBottom: 8 }}>How often</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['daily', 'specific_days_week', 'days_per_week', 'specific_days_month', 'days_per_month'] as const).map(type => (
                  <button key={type} className={`seg-btn${editScheduleType === type ? ' active' : ''}`} onClick={() => setEditScheduleType(type)}>
                    {type === 'daily' ? 'Every day'
                      : type === 'specific_days_week' ? 'Specific days'
                      : type === 'days_per_week' ? 'X days/week'
                      : type === 'specific_days_month' ? 'Specific dates'
                      : 'X days/month'}
                  </button>
                ))}
              </div>

              {editScheduleType === 'specific_days_week' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {DAYS_SHORT.map((d, i) => (
                    <button key={d} className={`day-btn${editScheduleDays.includes(i) ? ' active' : ''}`}
                      onClick={() => toggleEditScheduleDay(i)}
                      style={{ background: editScheduleDays.includes(i) ? `${editColor}22` : 'transparent', borderColor: editScheduleDays.includes(i) ? editColor : undefined, color: editScheduleDays.includes(i) ? editColor : undefined }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {editScheduleType === 'days_per_week' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <input type="number" min={1} max={7} value={editScheduleCount} onChange={e => setEditScheduleCount(Number(e.target.value))} className="text-input" style={{ width: 72 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>days per week</span>
                </div>
              )}

              {editScheduleType === 'specific_days_month' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <button key={d} className={`day-btn${editScheduleDays.includes(d) ? ' active' : ''}`}
                      onClick={() => toggleEditScheduleDay(d)}
                      style={{ width: 36, fontSize: 11, background: editScheduleDays.includes(d) ? `${editColor}22` : 'transparent', borderColor: editScheduleDays.includes(d) ? editColor : undefined, color: editScheduleDays.includes(d) ? editColor : undefined }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {editScheduleType === 'days_per_month' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <input type="number" min={1} max={31} value={editScheduleCount} onChange={e => setEditScheduleCount(Number(e.target.value))} className="text-input" style={{ width: 72 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>days per month</span>
                </div>
              )}
            </div>

            <div>
              <div className="form-label" style={{ marginBottom: 8 }}>Goal</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min={1}
                  value={editGoalValue}
                  onChange={e => setEditGoalValue(Math.max(1, Number(e.target.value)))}
                  className="text-input"
                  style={{ width: 80, textAlign: 'center', fontSize: 20, fontWeight: 700, padding: '10px' }}
                />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>× per</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['day', 'week', 'month'] as const).map(p => (
                    <button key={p} className={`seg-btn${editGoalPeriod === p ? ' active' : ''}`} onClick={() => setEditGoalPeriod(p)}>{p}</button>
                  ))}
                </div>
              </div>
            </div>

            <RemindersField
              times={editReminderTimes}
              onChange={setEditReminderTimes}
              goalValue={editGoalPeriod === 'day' ? editGoalValue : 1}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" style={{ fontSize: 13 }} onClick={cancelEdit} disabled={editSaving}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 13 }} onClick={saveEdit} disabled={editSaving || !editName.trim()}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </BottomSheet>

        {habits.length === 0 && !adding && (
          <div className="empty-state">No habits yet — add one to start tracking.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {habits.map((habit, idx) => {
            const pct = habit.goal_value > 0 ? Math.min(1, habit.period_done / habit.goal_value) : 0;
            const isGoalOne = habit.goal_value === 1;
            const isDraggedRow = draggedId === habit.id;
            const indicatorBefore = draggedId !== null && dropIndex === idx && dropIndex !== habits.findIndex(h => h.id === draggedId);

            return (
              <Fragment key={habit.id}>
                {indicatorBefore && <div className="habit-drop-indicator" />}
              <div className={`habit-row-wrap${isDraggedRow ? ' dragging' : ''}`} data-habit-wrap={habit.id}>
                {!isDraggedRow && (
                  <div className="habit-actions">
                    <button data-no-swipe className="habit-action-btn edit" onClick={() => startEdit(habit)} aria-label="Edit habit">
                      <Pencil size={14} strokeWidth={2} />
                      EDIT
                    </button>
                    <button data-no-swipe className="habit-action-btn delete" onClick={() => deleteHabit(habit.id)} aria-label="Delete habit">
                      <Trash2 size={14} strokeWidth={2} />
                      DELETE
                    </button>
                  </div>
                )}
                <div
                  ref={el => {
                    if (el) rowRefs.current.set(habit.id, el);
                    else rowRefs.current.delete(habit.id);
                  }}
                  className={`habit-row${habit.is_complete ? ' done' : ''}${isDraggedRow ? ' reordering' : ''}`}
                  style={{
                    borderLeft: `3px solid ${habit.color}`,
                    transform: revealedId === habit.id ? `translateX(${-ACTION_WIDTH}px)` : undefined,
                  }}
                  onPointerDown={e => onRowPointerDown(e, habit.id, idx)}
                  onPointerMove={onRowPointerMove}
                  onPointerUp={onRowPointerUp}
                  onPointerCancel={onRowPointerUp}
                >
                  {isGoalOne ? (
                    <button data-no-swipe className="habit-check" onClick={() => habit.is_complete ? decrement(habit) : increment(habit)}
                      style={{ borderColor: habit.color, background: habit.is_complete ? habit.color : 'transparent' }}>
                      {habit.is_complete && (
                        <svg width="15" height="15" viewBox="0 0 13 13" fill="none">
                          <path d="M2 6.5L5.2 9.5L11 3.5" stroke="#050506" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ) : (
                    <button data-no-swipe className="count-btn" onClick={() => decrement(habit)} disabled={habit.period_done === 0}>−</button>
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
                    <button data-no-swipe className="count-btn" onClick={() => increment(habit)} style={{ borderColor: habit.is_complete ? habit.color : undefined }}>+</button>
                  )}

                  <span
                    data-drag-handle
                    className="habit-drag-handle"
                    aria-label="Reorder habit"
                    title="Drag to reorder"
                  >
                    <GripVertical size={18} strokeWidth={1.75} />
                  </span>
                </div>
              </div>
              </Fragment>
            );
          })}
          {draggedId !== null && dropIndex === habits.length && dropIndex !== habits.findIndex(h => h.id === draggedId) && (
            <div className="habit-drop-indicator" />
          )}
        </div>
      </div>
    </>
  );
}
