'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate } from '@/lib/dates';

export interface Goal {
  id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  queued: boolean;
  position: number;
}

interface Props {
  date: string;
  label: string;
  readOnly?: boolean;
  showProgress?: boolean;
  showStreak?: boolean;
  streakCount?: number;
  showPushBtn?: boolean;
  onPushRemaining?: () => void;
  onGoalsChange?: (goals: Goal[]) => void;
}

const LIMIT = 5;

export default function GoalCard({
  date, label, readOnly = false,
  showProgress = false, showStreak = false, streakCount = 0,
  showPushBtn = false, onPushRemaining, onGoalsChange,
}: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [input, setInput] = useState('');
  const [polishStatus, setPolishStatus] = useState('');
  const [polishBusy, setPolishBusy] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const fetchGoals = useCallback(async () => {
    const res = await fetch(`/api/goals?date=${date}`);
    const data = await res.json();
    setGoals(data);
    onGoalsChange?.(data);
    setLoading(false);
  }, [date, onGoalsChange]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  // ── CRUD helpers ────────────────────────────────────────────────────────────
  async function patchGoal(id: string, patch: Partial<Goal>) {
    const res = await fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const next = goals.map(g => g.id === id ? { ...g, ...patch } : g);
    setGoals(next);
    onGoalsChange?.(next);
  }

  async function deleteGoal(id: string) {
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    const next = goals.filter(g => g.id !== id);
    setGoals(next);
    onGoalsChange?.(next);
  }

  async function addGoal(text: string) {
    if (!text.trim()) return;
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, text: text.trim(), position: goals.length }),
    });
    const newGoal = await res.json();
    const next = [...goals, newGoal];
    setGoals(next);
    onGoalsChange?.(next);
    setInput('');
  }

  function handleAdd() { addGoal(input); }

  async function handlePolish() {
    if (!input.trim()) return;
    setPolishBusy(true);
    const res = await fetch('/api/ai/polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.trim() }),
    });
    const data = await res.json();
    if (data.fallback) {
      setPolishStatus('Polish needs an API key — added as-typed.');
      setTimeout(() => setPolishStatus(''), 3500);
    }
    await addGoal(data.polished);
    setPolishBusy(false);
  }

  // ── Drag reorder ─────────────────────────────────────────────────────────────
  async function handleDrop(toIdx: number) {
    const from = dragIdx.current;
    if (from == null || from === toIdx) return;
    const next = [...goals];
    const [item] = next.splice(from, 1);
    next.splice(toIdx, 0, item);
    dragIdx.current = null;
    setGoals(next);
    onGoalsChange?.(next);
    // Persist new positions
    await Promise.all(next.map((g, i) => fetch(`/api/goals/${g.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: i }),
    })));
  }

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const done = goals.filter(g => g.done).length;
  const total = goals.length;
  const allDone = total > 0 && done === total;
  const hasUnchecked = goals.some(g => !g.done);
  const visible = showAll ? goals : goals.slice(0, LIMIT);

  if (loading) return <div className="card" style={{ marginBottom: 16, minHeight: 80 }} />;

  return (
    <>
      <style>{`
        .gm-card { background:rgba(255,255,255,0.04); border-radius:16px; padding:20px 22px; backdrop-filter:blur(24px) saturate(1.2); box-shadow:0 12px 40px rgba(0,0,0,0.45); margin-bottom:16px; transition:background 0.4s ease; }
        .gm-card.all-done { background:radial-gradient(ellipse at 50% 0%,rgba(107,227,164,0.06),rgba(255,255,255,0.04) 60%); }
        .gm-goal-row { display:flex; align-items:center; gap:12px; padding:12px 14px; margin-bottom:6px; background:rgba(255,255,255,0.035); border-radius:12px; border:1px solid rgba(255,255,255,0.06); transition:background 0.15s; }
        .gm-goal-row:hover { background:rgba(255,255,255,0.06); }
        .gm-goal-row.is-done { opacity:0.45; background:rgba(107,227,164,0.04); }
        .gm-goal-row.is-queued { background:rgba(242,192,99,0.10); box-shadow:inset 3px 0 0 0 #F2C063; }
        .gm-goal-row.is-done .gm-goal-text { text-decoration:line-through; text-decoration-color:rgba(255,255,255,0.4); }
        .gm-goal-row.is-queued .gm-goal-text { color:#FFE2A8; }
        .drag-handle { font-size:14px; width:14px; opacity:0; cursor:grab; color:var(--text-tertiary); letter-spacing:-2px; transition:opacity 0.2s; flex-shrink:0; user-select:none; }
        .gm-goal-row:hover .drag-handle { opacity:1; }
        .cb-wrap { width:22px; height:22px; flex-shrink:0; position:relative; cursor:pointer; }
        .cb-wrap input { position:absolute; opacity:0; width:0; height:0; }
        .cb-custom { width:22px; height:22px; border-radius:7px; border:1.5px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.04); display:flex; align-items:center; justify-content:center; transition:all 0.2s ease; }
        .cb-wrap input:checked + .cb-custom { background:#6BE3A4; border-color:#6BE3A4; box-shadow:0 0 12px rgba(107,227,164,0.40); }
        .cb-custom::after { content:''; display:block; width:5px; height:9px; border:2px solid #0A0A0B; border-top:none; border-left:none; transform:rotate(45deg) scale(0); transition:transform 0.28s cubic-bezier(0.34,1.56,0.64,1); margin-top:-2px; }
        .cb-wrap input:checked + .cb-custom::after { transform:rotate(45deg) scale(1); }
        .gm-goal-text { flex:1; font-size:13.5px; color:var(--text-primary); cursor:text; outline:none; min-width:0; word-break:break-word; }
        .gm-goal-text[contenteditable="true"] { outline:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:2px 4px; }
        .queue-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--text-tertiary); opacity:0.55; padding:2px 4px; transition:opacity 0.2s,filter 0.2s; flex-shrink:0; }
        .queue-btn.active { color:#F2C063; opacity:1; filter:drop-shadow(0 0 4px rgba(242,192,99,0.65)); }
        .queue-btn:disabled { cursor:default; }
        .del-btn { background:none; border:none; cursor:pointer; font-size:16px; color:var(--text-tertiary); opacity:0; padding:2px 4px; transition:opacity 0.2s,color 0.2s; flex-shrink:0; line-height:1; }
        .gm-goal-row:hover .del-btn { opacity:0.5; }
        .del-btn:hover { color:var(--danger) !important; opacity:1 !important; }
        .gm-bar { display:flex; gap:4px; height:6px; margin-bottom:16px; }
        .gm-bar-seg { flex:1; border-radius:3px; background:rgba(255,255,255,0.10); transition:background 0.4s,box-shadow 0.4s; }
        .gm-bar-seg.done { background:#6BE3A4; box-shadow:0 0 6px rgba(107,227,164,0.40); }
        .streak-pill { display:inline-flex; align-items:center; gap:6px; padding:8px 12px; border-radius:999px; background:rgba(255,255,255,0.04); color:var(--text-tertiary); border:1px solid transparent; transition:all 0.3s; }
        .streak-pill.active { background:rgba(242,192,99,0.10); color:#F2C063; border-color:rgba(242,192,99,0.32); }
        .streak-pill.active .bolt { filter:drop-shadow(0 0 6px rgba(242,192,99,0.6)); }
        .show-more { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 14px; margin-bottom:6px; border-radius:12px; border:1px dashed rgba(255,255,255,0.12); background:none; color:var(--text-tertiary); font-size:12px; cursor:pointer; width:100%; font-family:var(--font-sans); transition:color 0.2s,border-color 0.2s; }
        .show-more:hover { color:var(--text-secondary); border-color:rgba(255,255,255,0.22); }
        .push-btn { display:none; width:100%; padding:10px 14px; margin-bottom:10px; border-radius:12px; border:1px dashed rgba(255,255,255,0.12); background:none; color:var(--text-tertiary); font-size:12px; cursor:pointer; font-family:var(--font-sans); transition:color 0.2s,border-color 0.2s; }
        .push-btn.visible { display:block; }
        .push-btn:hover { color:var(--text-primary); border-color:rgba(255,255,255,0.25); }
        .goal-input-wrap { display:flex; flex-direction:row; gap:8px; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:14px; margin-top:14px; }
        .goal-input-wrap input { flex:1; }
      `}</style>

      <div className={`gm-card${allDone ? ' all-done' : ''}`}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              {label} — {formatDate(date)}
            </div>
            {showProgress && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: allDone ? 'var(--success)' : undefined }}>{done}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text-tertiary)' }}>/ {total}</span>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: allDone ? 'var(--success)' : 'var(--text-tertiary)' }}>
                  {total === 0 ? 'no goals yet' : allDone ? 'all done — solid day' : 'complete'}
                </span>
              </div>
            )}
            {!showProgress && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Write tonight, locked until 6 AM.</div>
            )}
          </div>
          {showStreak && (
            <div className={`streak-pill${streakCount > 0 ? ' active' : ''}`}>
              <span className="bolt" style={{ fontSize: 13 }}>⚡</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{streakCount}</span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }}>day streak</span>
            </div>
          )}
          {!showProgress && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{total} planned</span>
          )}
        </div>

        {/* Progress bar */}
        {showProgress && goals.length > 0 && (
          <div className="gm-bar">
            {goals.map(g => <div key={g.id} className={`gm-bar-seg${g.done ? ' done' : ''}`} />)}
          </div>
        )}

        {/* Goal list */}
        <ul style={{ listStyle: 'none', marginBottom: 8 }}>
          {visible.map((goal, i) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              readOnly={readOnly}
              onCheck={(done) => patchGoal(goal.id, { done, done_at: done ? new Date().toISOString() : null })}
              onTextChange={(text) => patchGoal(goal.id, { text })}
              onQueue={() => patchGoal(goal.id, { queued: !goal.queued })}
              onDelete={() => deleteGoal(goal.id)}
              onDragStart={() => { dragIdx.current = i; }}
              onDrop={() => handleDrop(i)}
            />
          ))}
        </ul>

        {goals.length === 0 && (
          <div className="empty-state">{readOnly ? 'Nothing planned for tomorrow yet.' : 'No goals for today yet — add one below.'}</div>
        )}

        {goals.length > LIMIT && (
          <button className="show-more" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Show less ▴' : `Show ${goals.length - LIMIT} more ▾`}
          </button>
        )}

        {/* Push remaining */}
        {showPushBtn && (
          <button className={`push-btn${hasUnchecked ? ' visible' : ''}`} onClick={onPushRemaining}>
            Push remaining to tomorrow →
          </button>
        )}

        {/* Add row */}
        <div className="goal-input-wrap">
          <input
            className="text-input"
            type="text"
            placeholder={readOnly ? 'Add a goal for tomorrow…' : 'Add a goal for today…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn-primary" style={{ padding: '11px 16px', fontSize: 13 }} onClick={handleAdd}>+ Add</button>
          <button className="btn-secondary" style={{ padding: '11px 14px', fontSize: 13 }} onClick={handlePolish} disabled={polishBusy}>
            {polishBusy ? '…' : '✨'}
          </button>
        </div>
        {polishStatus && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>{polishStatus}</div>}
      </div>
    </>
  );
}

// ── Individual goal row ────────────────────────────────────────────────────────
function GoalRow({ goal, readOnly, onCheck, onTextChange, onQueue, onDelete, onDragStart, onDrop }: {
  goal: Goal;
  readOnly: boolean;
  onCheck: (done: boolean) => void;
  onTextChange: (text: string) => void;
  onQueue: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const originalRef = useRef('');

  function startEdit() {
    if (!textRef.current) return;
    originalRef.current = goal.text;
    textRef.current.contentEditable = 'true';
    textRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(textRef.current);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  function commitEdit() {
    if (!textRef.current) return;
    textRef.current.contentEditable = 'false';
    const newText = textRef.current.textContent?.trim() ?? '';
    if (newText && newText !== originalRef.current) onTextChange(newText);
    else textRef.current.textContent = goal.text;
  }

  function cancelEdit() {
    if (!textRef.current) return;
    textRef.current.textContent = goal.text;
    textRef.current.contentEditable = 'false';
  }

  return (
    <li
      className={`gm-goal-row${goal.done ? ' is-done' : ''}${goal.queued ? ' is-queued' : ''}`}
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <span className="drag-handle">⋮⋮</span>
      <label className="cb-wrap">
        <input type="checkbox" checked={goal.done} disabled={readOnly} onChange={e => onCheck(e.target.checked)} />
        <span className="cb-custom" />
      </label>
      <span
        ref={textRef}
        className="gm-goal-text"
        onClick={startEdit}
        onBlur={commitEdit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') cancelEdit(); }}
        suppressContentEditableWarning
      >{goal.text}</span>
      <button className={`queue-btn${goal.queued ? ' active' : ''}`} onClick={onQueue} disabled={readOnly} title="Queue for productivity window">⚡</button>
      <button className="del-btn" onClick={onDelete}>×</button>
    </li>
  );
}
