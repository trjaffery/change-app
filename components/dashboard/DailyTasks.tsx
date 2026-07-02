'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, NotebookPen, Repeat, MoreHorizontal, Clock, Plus } from 'lucide-react';
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
  parent_task_id: string | null;
  duration_minutes: number | null;
  tags: string[] | null;
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
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

  // The Home command bar's quick-add button dispatches this event — scroll the
  // add row into view and focus its input.
  useEffect(() => {
    function onFocusTaskInput() {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.addEventListener('focus-task-input', onFocusTaskInput);
    return () => window.removeEventListener('focus-task-input', onFocusTaskInput);
  }, []);

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
    const before = tasks;
    const optimistic = tasks.map(t => t.id === id ? { ...t, ...patch } : t);
    setTasks(optimistic);
    notify(optimistic);
    // Fire a completion pulse when this call is what checked the task off.
    if (patch.done === true) {
      setJustCompletedId(id);
      setTimeout(() => setJustCompletedId(prev => (prev === id ? null : prev)), 700);
    }
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh = await res.json() as Task;
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
    // Also drop any subtasks locally — the DB cascades on delete.
    const next = tasks.filter(t => t.id !== id && t.parent_task_id !== id);
    setTasks(next);
    notify(next);
    if (expandedId === id) setExpandedId(null);
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }

  async function addSubtask(parent: Task, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const siblings = tasks.filter(t => t.parent_task_id === parent.id);
    const position = (siblings[siblings.length - 1]?.position ?? -1) + 1;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: trimmed,
        due_date: parent.due_date ?? today,
        parent_task_id: parent.id,
        position,
      }),
    });
    if (!res.ok) { toast({ kind: 'error', message: "Couldn't add subtask" }); return; }
    const created = await res.json() as Task;
    const next = [...tasks, created];
    setTasks(next);
    notify(next);
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

  // ── Drag reorder — iOS-safe long-press pattern (unchanged) ─────────────────
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

  // Split into top-level tasks and subtasks. Subtasks nest under their parent.
  const parentTasks = tasks.filter(t => !t.parent_task_id);
  const subtasksByParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parent_task_id) continue;
    const list = subtasksByParent.get(t.parent_task_id) ?? [];
    list.push(t);
    subtasksByParent.set(t.parent_task_id, list);
  }
  for (const list of subtasksByParent.values()) list.sort((a, b) => a.position - b.position);

  // Sort parents: overdue first, then by priority, then position.
  const visibleTasks = [...parentTasks].sort((a, b) => {
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

  // Today's plan — sum of duration_minutes across every undone row (parents +
  // subtasks). Null durations don't contribute. Header hides if 0.
  const plannedMinutes = tasks
    .filter(t => !t.done && typeof t.duration_minutes === 'number')
    .reduce((sum, t) => sum + (t.duration_minutes ?? 0), 0);

  // Group parents into Overdue / Today. Subtasks travel with their parent.
  const overdueTasks = visibleTasks.filter(t => !t.done && t.due_date != null && t.due_date < today);
  const todayTasks = visibleTasks.filter(t => !overdueTasks.includes(t));
  const groups: { key: 'overdue' | 'today'; label: string; tone: string; items: Task[] }[] = [];
  if (overdueTasks.length > 0) groups.push({ key: 'overdue', label: 'Overdue', tone: '#FF6B6B', items: overdueTasks });
  groups.push({ key: 'today', label: 'Today', tone: 'var(--text-tertiary)', items: todayTasks });

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .dt-head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 4px;
        }
        .dt-title {
          font-family: var(--font-sans);
          font-size: 15px; font-weight: 600;
          letter-spacing: -0.005em;
          color: var(--text-primary);
        }
        .dt-count {
          font-family: var(--font-mono); font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--text-tertiary);
        }
        .dt-count.all-done { color: var(--success); }
        .dt-planned {
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--text-tertiary);
        }
        .dt-tag {
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.02em;
          padding: 1px 6px; border-radius: 5px;
          background: rgba(120,180,255,0.08);
          color: #78B4FF;
          border: 1px solid rgba(120,180,255,0.18);
        }

        .dt-subrow {
          position: relative;
          display: flex; align-items: center; gap: 10px;
          padding: 6px 10px 6px 40px;
          margin: 1px 0;
          font-size: 13px;
          border-radius: 8px;
          transition: background 160ms ease;
        }
        .dt-subrow:hover { background: rgba(255,255,255,0.02); }
        .dt-subrail {
          position: absolute; left: 20px; top: -4px; bottom: 10px;
          width: 1px;
          background: rgba(255,255,255,0.08);
        }
        .dt-subrail::after {
          content: ''; position: absolute; left: 0; bottom: 12px;
          width: 12px; height: 12px;
          border-left: 1px solid rgba(255,255,255,0.08);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          border-bottom-left-radius: 6px;
        }
        .dt-check-sm {
          width: 16px; height: 16px;
          border-width: 1.5px;
          margin-top: 0;
        }
        .dt-check-sm svg { width: 9px; height: 9px; }
        .dt-subtext {
          flex: 1; min-width: 0;
          color: var(--text-secondary);
          line-height: 1.4;
          word-break: break-word;
        }
        .dt-subtext.done {
          color: var(--text-tertiary);
          text-decoration: line-through;
          text-decoration-color: rgba(107,227,164,0.4);
        }
        .dt-subdel {
          background: none; border: none; cursor: pointer;
          color: var(--text-tertiary);
          font-size: 14px; line-height: 1;
          padding: 4px 6px; border-radius: 4px;
          opacity: 0.35;
          -webkit-tap-highlight-color: transparent;
          transition: opacity 160ms ease, color 160ms ease;
        }
        .dt-subrow:hover .dt-subdel { opacity: 0.7; }
        .dt-subdel:hover { color: var(--danger); opacity: 1; }

        .dt-empty {
          font-family: var(--font-sans);
          font-size: 15px; line-height: 1.5;
          color: var(--text-tertiary);
          padding: 18px 4px 6px;
        }

        .dt-section {
          display: flex; align-items: center; gap: 8px;
          padding: 14px 2px 8px;
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
        }
        .dt-section .dt-section-dot {
          width: 6px; height: 6px; border-radius: 50%;
        }
        .dt-section-count {
          margin-left: auto;
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary); letter-spacing: 0.06em;
        }

        .dt-row {
          position: relative;
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px 10px 12px 14px;
          margin: 2px 0;
          border-radius: 10px;
          transition: background 160ms ease, transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms ease;
          touch-action: pan-y; user-select: none; -webkit-user-select: none;
          background: transparent;
        }
        .dt-row::before {
          content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;
          width: 3px; border-radius: 3px;
          background: var(--row-prio, transparent);
          opacity: var(--row-prio-opacity, 0);
          transition: opacity 160ms ease;
        }
        .dt-row:hover { background: rgba(255,255,255,0.02); }
        .dt-row.reordering {
          z-index: 20;
          box-shadow: 0 12px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
          background: rgba(20,20,22,1); cursor: grabbing; touch-action: none;
        }
        .dt-row.just-added { animation: dt-in 380ms cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes dt-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .dt-drop-indicator { height: 0; border-top: 2px solid var(--success); margin: 2px 12px; border-radius: 1px; pointer-events: none; box-shadow: 0 0 8px rgba(107,227,164,0.4); animation: dt-pulse 1.2s ease-in-out infinite; }
        @keyframes dt-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

        /* Circular checkbox with stroke-in tick. */
        .dt-check {
          position: relative;
          width: 22px; height: 22px; border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.22);
          background: transparent; cursor: pointer;
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
          margin-top: 1px;
          -webkit-tap-highlight-color: transparent;
        }
        .dt-check:hover { border-color: rgba(255,255,255,0.42); background: rgba(255,255,255,0.03); }
        .dt-check.done {
          background: var(--success);
          border-color: var(--success);
        }
        .dt-check svg path { stroke-dasharray: 12; stroke-dashoffset: 12; }
        .dt-check.done svg path { animation: dt-tick 260ms cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes dt-tick { to { stroke-dashoffset: 0; } }

        .dt-row.just-completed .dt-check {
          animation: dt-check-pop 480ms cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes dt-check-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.18); }
          100% { transform: scale(1); }
        }

        .dt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .dt-text {
          font-size: 14.5px; line-height: 1.4;
          color: var(--text-primary);
          word-break: break-word;
        }
        .dt-text.done {
          color: var(--text-tertiary);
          text-decoration: line-through;
          text-decoration-color: rgba(107,227,164,0.5);
          text-decoration-thickness: 1.5px;
        }

        .dt-meta {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary); letter-spacing: 0.02em;
        }
        .dt-meta .dt-meta-item { display: inline-flex; align-items: center; gap: 4px; }
        .dt-meta .dt-meta-item.overdue { color: #FF6B6B; }
        .dt-meta .dt-meta-item.recur { color: #9F84FF; }
        .dt-meta .dt-meta-sep {
          width: 3px; height: 3px; border-radius: 50%;
          background: rgba(255,255,255,0.12);
        }

        .dt-chev {
          background: none; border: none;
          color: var(--text-tertiary); cursor: pointer;
          padding: 4px; flex-shrink: 0;
          align-self: flex-start; margin-top: -2px;
          transition: transform 200ms ease, color 160ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .dt-chev:hover { color: var(--text-secondary); }
        .dt-chev.open { transform: rotate(180deg); }

        .dt-expand { padding: 12px 6px 14px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid rgba(255,255,255,0.04); margin: 2px 0 6px; }
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

        /* Persistent add row — always visible, no toggle. */
        .dt-add-row {
          display: flex; align-items: center; gap: 12px;
          margin-top: 8px;
          padding: 12px 10px 12px 14px;
          border-radius: 10px;
          border: 1px dashed rgba(255,255,255,0.08);
          transition: border-color 160ms ease, background 160ms ease;
        }
        .dt-add-row:focus-within {
          border-color: rgba(107,227,164,0.28);
          background: rgba(107,227,164,0.03);
        }
        .dt-add-glyph {
          width: 22px; height: 22px; border-radius: 50%;
          border: 1.5px dashed rgba(255,255,255,0.22);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-tertiary); font-size: 14px; line-height: 1;
          flex-shrink: 0;
        }
        .dt-add-input {
          flex: 1; background: transparent; border: none; outline: none;
          color: var(--text-primary);
          font-family: var(--font-sans); font-size: 14.5px;
          padding: 0;
        }
        .dt-add-input::placeholder { color: var(--text-tertiary); }

        .dt-push {
          margin-top: 12px;
          padding: 8px 12px;
          border: 1px dashed rgba(255,255,255,0.14);
          border-radius: 9px;
          background: transparent;
          color: var(--text-tertiary);
          font-family: var(--font-sans);
          font-size: 12px;
          cursor: pointer;
          width: 100%;
          -webkit-tap-highlight-color: transparent;
          transition: border-color 160ms ease, color 160ms ease;
        }
        .dt-push:hover:not(:disabled) { border-color: rgba(255,255,255,0.24); color: var(--text-secondary); }
      `}</style>

      <div className="dt-head">
        <span className="dt-title">Today</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          {plannedMinutes > 0 && (
            <span className="dt-planned">{fmtDuration(plannedMinutes)} planned</span>
          )}
          {total > 0 && (
            <span className={`dt-count${done === total ? ' all-done' : ''}`}>
              {done}/{total}
            </span>
          )}
        </div>
      </div>

      {loading ? null : total === 0 ? (
        <div className="dt-empty">Nothing yet. Add the first one below.</div>
      ) : (
        (() => {
          let flatIdx = -1;
          return groups.map(group => (
            <Fragment key={group.key}>
              <div className="dt-section" style={{ color: group.tone }}>
                <span className="dt-section-dot" style={{ background: group.tone }} />
                {group.label}
                <span className="dt-section-count">{group.items.length}</span>
              </div>
              {group.items.map(t => {
                flatIdx++;
                const idx = flatIdx;
                const isExpanded = expandedId === t.id;
                const isDragged = draggedId === t.id;
                const indicatorBefore = draggedId !== null && dropIndex === idx && dropIndex !== visibleTasks.findIndex(x => x.id === draggedId);
                const overdue = !t.done && t.due_date != null && t.due_date < today;
                const prioColor = t.priority ? PRIORITY_COLOR[t.priority] : null;

                return (
                  <Fragment key={t.id}>
                    {indicatorBefore && <div className="dt-drop-indicator" />}
                    <div
                      ref={el => { if (el) rowRefs.current.set(t.id, el); else rowRefs.current.delete(t.id); }}
                      className={`dt-row${isDragged ? ' reordering' : ''}${justAddedId === t.id ? ' just-added' : ''}${justCompletedId === t.id ? ' just-completed' : ''}`}
                      style={{
                        ['--row-prio' as string]: prioColor ?? 'transparent',
                        ['--row-prio-opacity' as string]: prioColor ? '1' : '0',
                      }}
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
                        <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                          <path d="M2.5 6.8 5.4 9.4 10.5 3.6" stroke="#0e0e10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      <div className="dt-body">
                        <div className={`dt-text${t.done ? ' done' : ''}`}>{t.text}</div>
                        {(() => {
                          const hasDur = typeof t.duration_minutes === 'number';
                          const tags = t.tags ?? [];
                          const hasOtherMeta = overdue || t.recurrence || t.notes || (t.due_date && t.due_date !== today) || hasDur || tags.length > 0;
                          if (!hasOtherMeta) return null;
                          const items: React.ReactNode[] = [];
                          if (overdue && t.due_date) items.push(<span key="ov" className="dt-meta-item overdue">{overdueLabel(t.due_date, today)}</span>);
                          if (!overdue && t.due_date && t.due_date !== today) items.push(<span key="dt" className="dt-meta-item">{niceDate(t.due_date)}</span>);
                          if (hasDur) items.push(<span key="du" className="dt-meta-item"><Clock size={10} strokeWidth={2} /> {fmtDuration(t.duration_minutes!)}</span>);
                          if (t.recurrence) items.push(<span key="rc" className="dt-meta-item recur"><Repeat size={10} strokeWidth={2} /> {recurrenceLabel(t.recurrence)}</span>);
                          if (t.notes) items.push(<span key="no" className="dt-meta-item"><NotebookPen size={10} strokeWidth={2} /></span>);
                          for (const tag of tags) items.push(<span key={`tg-${tag}`} className="dt-tag">#{tag}</span>);
                          const withSeps: React.ReactNode[] = [];
                          items.forEach((it, i) => {
                            if (i > 0) withSeps.push(<span key={`s-${i}`} className="dt-meta-sep" />);
                            withSeps.push(it);
                          });
                          return <div className="dt-meta">{withSeps}</div>;
                        })()}
                      </div>

                      <button
                        data-no-drag
                        className={`dt-chev${isExpanded ? ' open' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <ChevronDown size={16} strokeWidth={1.75} /> : <MoreHorizontal size={16} strokeWidth={1.75} />}
                      </button>
                    </div>

                    {(subtasksByParent.get(t.id) ?? []).map(sub => (
                      <div key={sub.id} className="dt-subrow">
                        <span className="dt-subrail" />
                        <button
                          className={`dt-check dt-check-sm${sub.done ? ' done' : ''}`}
                          onClick={() => patchTask(sub.id, { done: !sub.done })}
                          aria-label={sub.done ? 'Mark not done' : 'Mark done'}
                        >
                          <svg width="10" height="10" viewBox="0 0 13 13" fill="none">
                            <path d="M2.5 6.8 5.4 9.4 10.5 3.6" stroke="#0e0e10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <span className={`dt-subtext${sub.done ? ' done' : ''}`}>{sub.text}</span>
                        {typeof sub.duration_minutes === 'number' && (
                          <span className="dt-meta-item" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            <Clock size={9} strokeWidth={2} /> {fmtDuration(sub.duration_minutes)}
                          </span>
                        )}
                        <button
                          className="dt-subdel"
                          onClick={() => deleteTask(sub.id)}
                          aria-label="Delete subtask"
                        >×</button>
                      </div>
                    ))}

                    {isExpanded && (
                      <ExpandedEditor
                        task={t}
                        subtaskCount={(subtasksByParent.get(t.id) ?? []).length}
                        onPatch={patch => patchTask(t.id, patch)}
                        onDelete={() => deleteTask(t.id)}
                        onAddSubtask={text => addSubtask(t, text)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ));
        })()
      )}

      {undoneNonRecurring > 0 && (
        <button className="dt-push" onClick={pushToTomorrow} disabled={pushing}>
          {pushing ? 'Pushing…' : '↪ Push remaining to tomorrow'}
        </button>
      )}

      <div className="dt-add-row">
        <span className="dt-add-glyph">+</span>
        <input
          ref={inputRef}
          className="dt-add-input"
          placeholder="Add a task…"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setNewText(''); }}
        />
      </div>
    </div>
  );
}

function ExpandedEditor({ task, subtaskCount, onPatch, onDelete, onAddSubtask }: {
  task: Task;
  subtaskCount: number;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onAddSubtask: (text: string) => void;
}) {
  const [text, setText] = useState(task.text);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const [duration, setDuration] = useState<string>(task.duration_minutes != null ? String(task.duration_minutes) : '');
  const [tagsInput, setTagsInput] = useState((task.tags ?? []).join(', '));
  const [newSubtaskText, setNewSubtaskText] = useState('');
  useEffect(() => {
    setText(task.text);
    setNotes(task.notes ?? '');
    setDueDate(task.due_date ?? '');
    setDuration(task.duration_minutes != null ? String(task.duration_minutes) : '');
    setTagsInput((task.tags ?? []).join(', '));
  }, [task.id, task.text, task.notes, task.due_date, task.duration_minutes, task.tags]);

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
  function commitDuration() {
    const trimmed = duration.trim();
    const parsed = trimmed === '' ? null : Math.max(0, Math.min(600, Math.round(Number(trimmed))));
    const next = parsed === null || Number.isNaN(parsed) ? null : parsed;
    if (next !== (task.duration_minutes ?? null)) onPatch({ duration_minutes: next });
  }
  function commitTags() {
    const parsed = tagsInput
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    const current = (task.tags ?? []).slice().sort();
    const next = parsed.slice().sort();
    if (current.join('|') !== next.join('|')) onPatch({ tags: parsed });
  }
  function submitSubtask() {
    const t = newSubtaskText.trim();
    if (!t) return;
    onAddSubtask(t);
    setNewSubtaskText('');
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
        <div className="dt-section-label">Time estimate</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            className="dt-input"
            type="number" min={1} max={600}
            value={duration}
            onChange={e => setDuration(e.target.value)}
            onBlur={commitDuration}
            placeholder="minutes"
            style={{ width: 110 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {duration && !isNaN(Number(duration)) ? `= ${fmtDuration(Number(duration))}` : 'minutes'}
          </span>
        </div>
      </div>

      <div>
        <div className="dt-section-label">Tags</div>
        <input
          className="dt-input"
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          onBlur={commitTags}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="home, work, errands  (comma-separated)"
        />
      </div>

      <div>
        <div className="dt-section-label">Subtasks {subtaskCount > 0 && <span style={{ opacity: 0.7 }}>({subtaskCount})</span>}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="dt-input"
            value={newSubtaskText}
            onChange={e => setNewSubtaskText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitSubtask(); } }}
            placeholder="+ Add a subtask, press Enter"
          />
        </div>
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
