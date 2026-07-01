'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, NotebookPen, Repeat } from 'lucide-react';
import { getActiveDateString, getTomorrowDateString } from '@/lib/dates';
import { useToast } from '@/components/layout/Toast';
import { buildRecurrence, parseRecurrence, recurrenceLabel } from '@/lib/recurrence';

type Priority = 'low' | 'med' | 'high' | null;

interface Task {
  id: string;
  text: string;
  notes: string | null;
  priority: Priority;
  due_date: string | null;
  recurrence: string | null;
  done: boolean;
  done_at: string | null;
  position: number;
}

const PRIORITY_COLOR: Record<NonNullable<Priority>, string> = {
  high: '#FF6B6B',
  med:  '#F2C063',
  low:  '#78B4FF',
};
const PRIORITY_ORDER: Record<NonNullable<Priority> | 'none', number> = {
  high: 0, med: 1, low: 2, none: 3,
};
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function DailyTasks({ onChange }: { onChange?: (done: number, total: number) => void }) {
  const today = getActiveDateString();
  const tomorrow = getTomorrowDateString();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks the most recently-added task so we can play a one-shot slide-in
  // animation on just that row. Cleared after the animation completes.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gestureRef = useRef<null | {
    id: string; startX: number; startY: number;
    state: 'pending' | 'reordering' | 'cancelled';
    longPressTimer: ReturnType<typeof setTimeout> | null;
    initialIdx: number; rowHeight: number;
  }>(null);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?date=${today}`);
      const data = await res.json() as Task[];
      const list = Array.isArray(data) ? data : [];
      setTasks(list);
      onChangeRef.current?.(list.filter(t => t.done).length, list.length);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  function notify(list: Task[]) {
    onChangeRef.current?.(list.filter(t => t.done).length, list.length);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('tasks-changed'));
  }

  async function addTask() {
    const text = newText.trim();
    if (!text) return;
    const position = (tasks[tasks.length - 1]?.position ?? -1) + 1;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, due_date: today, position }),
    });
    const created = await res.json() as Task;
    const next = [...tasks, created];
    setTasks(next);
    notify(next);
    setJustAddedId(created.id);
    setTimeout(() => setJustAddedId(prev => (prev === created.id ? null : prev)), 500);
    setNewText('');
    inputRef.current?.focus();
  }

  async function patchTask(id: string, patch: Partial<Task>) {
    // Optimistic — the recurrence-aware server can rewrite due_date/done, so
    // we re-sync from the response.
    const before = tasks;
    const optimistic = tasks.map(t => t.id === id ? { ...t, ...patch } : t);
    setTasks(optimistic);
    notify(optimistic);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh = await res.json() as Task;
      // If the server hid the row from "today" (recurrence advanced its
      // due_date past today), drop it from local list.
      const stillVisible = (!fresh.done || (fresh.done_at && fresh.done_at.slice(0, 10) === today))
        && (fresh.due_date != null && fresh.due_date <= today);
      const refreshed = stillVisible
        ? optimistic.map(t => t.id === id ? fresh : t)
        : optimistic.filter(t => t.id !== id);
      setTasks(refreshed);
      notify(refreshed);
    } catch {
      setTasks(before);
      notify(before);
      toast({ kind: 'error', message: 'Save failed' });
    }
  }

  async function deleteTask(id: string) {
    const next = tasks.filter(t => t.id !== id);
    setTasks(next);
    notify(next);
    if (expandedId === id) setExpandedId(null);
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }

  async function pushToTomorrow() {
    if (pushing) return;
    const undone = tasks.filter(t => !t.done && !t.recurrence);
    if (undone.length === 0) return;
    setPushing(true);
    const snapshot = tasks;
    const remaining = tasks.filter(t => t.done || t.recurrence);
    setTasks(remaining);
    notify(remaining);
    try {
      await fetch('/api/tasks/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: today, to: tomorrow }),
      });
      toast({
        kind: 'success',
        message: `${undone.length} task${undone.length !== 1 ? 's' : ''} pushed to tomorrow`,
        undo: async () => {
          await fetch('/api/tasks/push', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: tomorrow, to: today }),
          });
          setTasks(snapshot);
          notify(snapshot);
        },
      });
    } catch (e) {
      setTasks(snapshot);
      notify(snapshot);
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Push failed' });
    } finally {
      setPushing(false);
    }
  }

  // ── Drag reorder — iOS-safe long-press pattern (see HabitList for the
  // companion non-passive touchmove fix that supports this). ───────────────
  function setRowTransform(id: string, value: string, options: { transition?: string } = {}) {
    const el = rowRefs.current.get(id);
    if (!el) return;
    if (options.transition !== undefined) el.style.transition = options.transition;
    el.style.transform = value;
  }

  function enterReorder(id: string, pointerId: number) {
    const g = gestureRef.current;
    if (!g || g.state !== 'pending' || g.id !== id) return;
    g.state = 'reordering';
    g.longPressTimer = null;
    const el = rowRefs.current.get(id);
    if (!el) return;
    el.setPointerCapture(pointerId);
    setRowTransform(id, 'translateY(0) scale(1.02)', { transition: 'none' });
    el.classList.add('reordering');
    setDraggedId(id);
    setDropIndex(g.initialIdx);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(15); } catch { /* ignore */ }
    }
  }

  function onRowPointerDown(e: React.PointerEvent<HTMLDivElement>, id: string, idx: number) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    if (expandedId) return;
    const rowEl = rowRefs.current.get(id);
    if (!rowEl) return;
    const pointerId = e.pointerId;
    const longPressTimer = setTimeout(() => enterReorder(id, pointerId), 320);
    gestureRef.current = {
      id, startX: e.clientX, startY: e.clientY,
      state: 'pending', longPressTimer,
      initialIdx: idx,
      rowHeight: rowEl.getBoundingClientRect().height,
    };
  }

  function onRowPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g) return;
    const dy = e.clientY - g.startY;
    const dx = e.clientX - g.startX;

    if (g.state === 'pending') {
      if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
        if (g.longPressTimer) { clearTimeout(g.longPressTimer); g.longPressTimer = null; }
        g.state = 'cancelled';
      }
      return;
    }

    if (g.state === 'reordering') {
      if (e.cancelable) e.preventDefault();
      setRowTransform(g.id, `translateY(${dy}px) scale(1.02)`);
      const slotShift = Math.round(dy / Math.max(1, g.rowHeight));
      const target = Math.max(0, Math.min(visibleTasks.length - 1, g.initialIdx + slotShift));
      setDropIndex(prev => prev === target ? prev : target);
    }
  }

  function onRowPointerUp() {
    const g = gestureRef.current;
    if (!g) return;
    if (g.longPressTimer) { clearTimeout(g.longPressTimer); g.longPressTimer = null; }
    if (g.state === 'reordering') {
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

  useEffect(() => {
    if (draggedId === null) return;
    function onTouchMove(e: TouchEvent) { if (e.cancelable) e.preventDefault(); }
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, [draggedId]);

  async function commitReorder(_id: string, from: number, to: number) {
    const next = [...visibleTasks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // Re-thread positions over the full task list using the new visible order.
    const visibleIds = new Set(visibleTasks.map(t => t.id));
    const reorderedVisible = next;
    let vIdx = 0;
    const merged = tasks.map(t => {
      if (visibleIds.has(t.id)) {
        const newT = reorderedVisible[vIdx++];
        return { ...newT, position: vIdx - 1 };
      }
      return t;
    });
    setTasks(merged);
    notify(merged);
    await Promise.all(reorderedVisible.map((t, i) => fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: i }),
    })));
  }

  if (loading) return null;

  // Sort: overdue first, then by priority, then position.
  const visibleTasks = [...tasks].sort((a, b) => {
    const aOver = !a.done && a.due_date != null && a.due_date < today;
    const bOver = !b.done && b.due_date != null && b.due_date < today;
    if (aOver !== bOver) return aOver ? -1 : 1;
    const pa = PRIORITY_ORDER[a.priority ?? 'none'];
    const pb = PRIORITY_ORDER[b.priority ?? 'none'];
    if (pa !== pb) return pa - pb;
    return a.position - b.position;
  });

  const done = visibleTasks.filter(t => t.done).length;
  const total = visibleTasks.length;
  const undoneNonRecurring = visibleTasks.filter(t => !t.done && !t.recurrence).length;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .dt-row { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 10px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); border-radius: 8px; transition: transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms ease; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
        .dt-row:last-of-type { border-bottom: none; }
        .dt-row.reordering { z-index: 20; box-shadow: 0 12px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08); background: rgba(20,20,22,1); cursor: grabbing; touch-action: none; }
        .dt-drop-indicator { height: 0; border-top: 2px solid var(--success); margin: 2px 8px; border-radius: 1px; pointer-events: none; box-shadow: 0 0 8px rgba(107,227,164,0.4); animation: dt-pulse 1.2s ease-in-out infinite; }
        @keyframes dt-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        /* One-shot slide-in for a task that was just added. Global reduced-motion
           rule collapses this to instant. */
        .dt-row.just-added { animation: dt-in 380ms cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes dt-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .dt-check { width: 22px; height: 22px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.18); background: transparent; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.15s; margin-top: 2px; }
        .dt-check.done { background: rgba(107,227,164,0.15); border-color: var(--success); }
        .dt-prio { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; align-self: center; }
        .dt-text { flex: 1; min-width: 0; font-size: 14px; color: var(--text-primary); line-height: 1.4; cursor: text; word-break: break-word; }
        .dt-text.done { color: var(--text-tertiary); text-decoration: line-through; text-decoration-color: rgba(107,227,164,0.4); }
        .dt-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
        .dt-badge { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 999px; border: 1px solid; display: inline-flex; align-items: center; gap: 4px; text-transform: uppercase; }
        .dt-badge.overdue { color: #FF6B6B; border-color: rgba(255,107,107,0.35); background: rgba(255,107,107,0.08); }
        .dt-badge.duesoon { color: var(--text-tertiary); border-color: rgba(255,255,255,0.1); }
        .dt-badge.recur { color: #9F84FF; border-color: rgba(159,132,255,0.3); background: rgba(159,132,255,0.05); }
        .dt-badge.notes { color: var(--text-tertiary); border-color: rgba(255,255,255,0.08); }
        .dt-chev { background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 4px; flex-shrink: 0; align-self: flex-start; margin-top: -2px; transition: transform 200ms ease; -webkit-tap-highlight-color: transparent; }
        .dt-chev.open { transform: rotate(180deg); }

        .dt-expand { padding: 12px 6px 14px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .dt-section-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 6px; }
        .dt-input { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px; color: var(--text-primary); font-family: var(--font-sans); font-size: 13px; outline: none; }
        .dt-input:focus { border-color: rgba(255,255,255,0.16); }
        .dt-textarea { min-height: 64px; resize: vertical; }
        .dt-chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .dt-chip { padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: var(--text-secondary); font-size: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: all 0.15s; }
        .dt-chip.active { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); color: var(--text-primary); font-weight: 600; }
        .dt-chip.prio-high.active { background: rgba(255,107,107,0.15); border-color: rgba(255,107,107,0.45); color: #FF6B6B; }
        .dt-chip.prio-med.active  { background: rgba(242,192,99,0.15); border-color: rgba(242,192,99,0.45); color: #F2C063; }
        .dt-chip.prio-low.active  { background: rgba(120,180,255,0.15); border-color: rgba(120,180,255,0.45); color: #78B4FF; }
        .dt-day-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: var(--text-secondary); font-size: 11px; font-weight: 600; cursor: pointer; text-transform: uppercase; -webkit-tap-highlight-color: transparent; }
        .dt-day-btn.active { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); color: var(--text-primary); }
        .dt-delete { background: none; border: none; color: var(--danger); font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; padding: 6px 0; -webkit-tap-highlight-color: transparent; align-self: flex-start; }
      `}</style>

      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Today&apos;s tasks</span>
        {total > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: done === total ? 'var(--success)' : 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
            {done}/{total}
          </span>
        )}
      </div>

      {visibleTasks.map((t, idx) => {
        const isExpanded = expandedId === t.id;
        const isDragged = draggedId === t.id;
        const indicatorBefore = draggedId !== null && dropIndex === idx && dropIndex !== visibleTasks.findIndex(x => x.id === draggedId);
        const overdue = !t.done && t.due_date != null && t.due_date < today;
        const prioColor = t.priority ? PRIORITY_COLOR[t.priority] : 'rgba(255,255,255,0.18)';

        return (
          <Fragment key={t.id}>
            {indicatorBefore && <div className="dt-drop-indicator" />}
            <div
              ref={el => { if (el) rowRefs.current.set(t.id, el); else rowRefs.current.delete(t.id); }}
              className={`dt-row${isDragged ? ' reordering' : ''}${justAddedId === t.id ? ' just-added' : ''}`}
              onPointerDown={e => onRowPointerDown(e, t.id, idx)}
              onPointerMove={onRowPointerMove}
              onPointerUp={onRowPointerUp}
              onPointerCancel={onRowPointerUp}
            >
              <button
                data-no-drag
                className={`dt-check${t.done ? ' done' : ''}`}
                onClick={() => patchTask(t.id, { done: !t.done })}
                aria-label={t.done ? 'Mark not done' : 'Mark done'}
              >
                {t.done && (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 6.5L5.2 9.5L11 3.5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              <span className="dt-prio" style={{ background: prioColor, opacity: t.priority ? 1 : 0.35 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`dt-text${t.done ? ' done' : ''}`}>{t.text}</div>
                {(overdue || t.recurrence || t.notes || (t.due_date && t.due_date !== today)) && (
                  <div className="dt-meta">
                    {overdue && t.due_date && (
                      <span className="dt-badge overdue">{overdueLabel(t.due_date, today)}</span>
                    )}
                    {!overdue && t.due_date && t.due_date !== today && (
                      <span className="dt-badge duesoon">{niceDate(t.due_date)}</span>
                    )}
                    {t.recurrence && (
                      <span className="dt-badge recur"><Repeat size={9} strokeWidth={2} /> {recurrenceLabel(t.recurrence)}</span>
                    )}
                    {t.notes && (
                      <span className="dt-badge notes"><NotebookPen size={9} strokeWidth={2} /></span>
                    )}
                  </div>
                )}
              </div>

              <button
                data-no-drag
                className={`dt-chev${isExpanded ? ' open' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                <ChevronDown size={16} strokeWidth={1.75} />
              </button>
            </div>

            {isExpanded && (
              <ExpandedEditor
                task={t}
                onPatch={patch => patchTask(t.id, patch)}
                onDelete={() => deleteTask(t.id)}
              />
            )}
          </Fragment>
        );
      })}

      {undoneNonRecurring > 0 && (
        <button
          onClick={pushToTomorrow}
          disabled={pushing}
          style={{
            marginTop: 12,
            padding: '8px 12px',
            border: '1px dashed rgba(255,255,255,0.14)',
            borderRadius: 9,
            background: 'transparent',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            cursor: 'pointer',
            width: '100%',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {pushing ? 'Pushing…' : '↪ Push remaining to tomorrow'}
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        {adding || total === 0 ? (
          <>
            <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>+</span>
            <input
              ref={inputRef}
              className="dt-input"
              style={{ background: 'transparent', border: 'none', padding: 0 }}
              placeholder="New task…"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') { setAdding(false); setNewText(''); } }}
              autoFocus={adding}
            />
            {adding && (
              <button onClick={() => { setAdding(false); setNewText(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
            )}
          </>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, padding: '4px 0', fontFamily: 'var(--font-sans)' }}
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}

function ExpandedEditor({ task, onPatch, onDelete }: {
  task: Task;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(task.text);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  useEffect(() => { setText(task.text); setNotes(task.notes ?? ''); setDueDate(task.due_date ?? ''); }, [task.id, task.text, task.notes, task.due_date]);

  const rec = parseRecurrence(task.recurrence);
  const [mode, setMode] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(rec.mode);
  const [weeklyDays, setWeeklyDays] = useState<string[]>(rec.mode === 'weekly' ? rec.days : []);
  const [monthlyDay, setMonthlyDay] = useState<number>(rec.mode === 'monthly' ? rec.day : 1);
  useEffect(() => {
    const r = parseRecurrence(task.recurrence);
    setMode(r.mode);
    setWeeklyDays(r.mode === 'weekly' ? r.days : []);
    setMonthlyDay(r.mode === 'monthly' ? r.day : 1);
  }, [task.recurrence]);

  function commitText() {
    const trimmed = text.trim();
    if (trimmed && trimmed !== task.text) onPatch({ text: trimmed });
    else setText(task.text);
  }
  function commitNotes() {
    const trimmed = notes.trim();
    if ((trimmed || null) !== (task.notes ?? null)) onPatch({ notes: trimmed || null });
  }
  function commitDue() {
    const v = dueDate || null;
    if (v !== (task.due_date ?? null)) onPatch({ due_date: v });
  }

  function setRec(next: typeof mode, days = weeklyDays, day = monthlyDay) {
    setMode(next);
    const built = buildRecurrence(next, days, day);
    if (built !== task.recurrence) onPatch({ recurrence: built });
  }

  function setPriority(p: Priority) {
    if (p === task.priority) onPatch({ priority: null });
    else onPatch({ priority: p });
  }

  function toggleDay(d: string) {
    const next = weeklyDays.includes(d) ? weeklyDays.filter(x => x !== d) : [...weeklyDays, d];
    setWeeklyDays(next);
    setRec('weekly', next, monthlyDay);
  }

  return (
    <div className="dt-expand" data-no-drag>
      <div>
        <div className="dt-section-label">Text</div>
        <input
          className="dt-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      <div>
        <div className="dt-section-label">Priority</div>
        <div className="dt-chip-row">
          {(['low', 'med', 'high'] as const).map(p => (
            <button key={p} className={`dt-chip prio-${p}${task.priority === p ? ' active' : ''}`} onClick={() => setPriority(p)}>
              {p === 'low' ? 'Low' : p === 'med' ? 'Med' : 'High'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="dt-section-label">Due date</div>
        <input
          type="date"
          className="dt-input"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          onBlur={commitDue}
        />
      </div>

      <div>
        <div className="dt-section-label">Repeat</div>
        <div className="dt-chip-row" style={{ marginBottom: mode === 'none' ? 0 : 8 }}>
          {(['none', 'daily', 'weekly', 'monthly'] as const).map(m => (
            <button key={m} className={`dt-chip${mode === m ? ' active' : ''}`} onClick={() => setRec(m)}>
              {m === 'none' ? 'None' : m === 'daily' ? 'Daily' : m === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
        {mode === 'weekly' && (
          <div className="dt-chip-row">
            {WEEKDAYS.map(d => (
              <button key={d} className={`dt-day-btn${weeklyDays.includes(d) ? ' active' : ''}`} onClick={() => toggleDay(d)}>
                {d.slice(0, 1).toUpperCase()}
              </button>
            ))}
          </div>
        )}
        {mode === 'monthly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Day of month</span>
            <input
              type="number" min={1} max={31} value={monthlyDay}
              onChange={e => { const v = Math.max(1, Math.min(31, Number(e.target.value) || 1)); setMonthlyDay(v); setRec('monthly', weeklyDays, v); }}
              className="dt-input"
              style={{ width: 70 }}
            />
          </div>
        )}
      </div>

      <div>
        <div className="dt-section-label">Notes</div>
        <textarea
          className="dt-input dt-textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder="Optional context…"
        />
      </div>

      <button className="dt-delete" onClick={onDelete}>Delete task</button>
    </div>
  );
}

function niceDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function overdueLabel(due: string, today: string): string {
  const d1 = new Date(due + 'T12:00:00');
  const d2 = new Date(today + 'T12:00:00');
  const days = Math.round((d2.getTime() - d1.getTime()) / 86400_000);
  if (days === 1) return 'Yesterday';
  return `${days}d overdue`;
}
