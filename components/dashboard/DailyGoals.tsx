'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString, getTomorrowDateString } from '@/lib/dates';
import { useToast } from '@/components/layout/Toast';

interface Goal {
  id: string;
  date: string;
  text: string;
  done: boolean;
  position: number;
}

export default function DailyGoals({ onChange }: { onChange?: (done: number, total: number) => void }) {
  const today = getActiveDateString();
  const tomorrow = getTomorrowDateString();
  const toast = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pushing, setPushing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      // Roll yesterday's unfinished goals forward before fetching today's list.
      // Idempotent — second call is a no-op since nothing's left to roll.
      await fetch('/api/goals/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      }).catch(() => { /* silent — UI still shows what's in DB */ });

      const res = await fetch(`/api/goals?date=${today}`);
      const data = (await res.json()) as Goal[];
      const list = Array.isArray(data) ? data : [];
      setGoals(list);
      onChangeRef.current?.(list.filter(g => g.done).length, list.length);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  async function pushToTomorrow() {
    if (pushing) return;
    const undone = goals.filter(g => !g.done);
    if (undone.length === 0) return;
    setPushing(true);
    // Optimistic — remove undone goals from today's view; the API moves them in DB.
    const snapshot = goals;
    const remaining = goals.filter(g => g.done);
    setGoals(remaining);
    notify(remaining);
    try {
      await fetch('/api/goals/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: today, to: tomorrow }),
      });
      toast({
        kind: 'success',
        message: `${undone.length} goal${undone.length !== 1 ? 's' : ''} pushed to tomorrow`,
        undo: async () => {
          // Reverse the push by rolling them back to today.
          await fetch('/api/goals/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: tomorrow, to: today }),
          });
          setGoals(snapshot);
          notify(snapshot);
        },
      });
    } catch (e) {
      // Roll back optimistic state on network error.
      setGoals(snapshot);
      notify(snapshot);
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Push failed' });
    } finally {
      setPushing(false);
    }
  }

  function notify(list: Goal[]) {
    onChangeRef.current?.(list.filter(g => g.done).length, list.length);
  }

  async function toggleDone(g: Goal) {
    const next = goals.map(x => x.id === g.id ? { ...x, done: !x.done } : x);
    setGoals(next);
    notify(next);
    await fetch(`/api/goals/${g.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !g.done, done_at: !g.done ? new Date().toISOString() : null }),
    });
  }

  async function addGoal() {
    const text = newText.trim();
    if (!text) return;
    const position = (goals[goals.length - 1]?.position ?? -1) + 1;
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, text, position }),
    });
    const created = (await res.json()) as Goal;
    const next = [...goals, created];
    setGoals(next);
    notify(next);
    setNewText('');
    inputRef.current?.focus();
  }

  async function deleteGoal(id: string) {
    const next = goals.filter(g => g.id !== id);
    setGoals(next);
    notify(next);
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) { setEditingId(null); return; }
    const next = goals.map(g => g.id === id ? { ...g, text } : g);
    setGoals(next);
    setEditingId(null);
    await fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }

  if (loading) return null;

  const done = goals.filter(g => g.done).length;
  const total = goals.length;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .dg-row { display:flex; align-items:center; gap:10px; padding:9px 4px; border-bottom:1px solid rgba(255,255,255,0.04); }
        .dg-row:last-of-type { border-bottom:none; }
        .dg-check { width:22px; height:22px; border-radius:7px; border:1px solid rgba(255,255,255,0.12); background:transparent; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
        .dg-check.done { background:rgba(107,227,164,0.15); border-color:var(--success); }
        .dg-text { flex:1; font-size:14px; color:var(--text-primary); line-height:1.4; cursor:text; }
        .dg-text.done { color:var(--text-tertiary); text-decoration:line-through; text-decoration-color:rgba(107,227,164,0.4); text-decoration-thickness:1px; }
        .dg-del { background:none; border:none; color:var(--text-tertiary); cursor:pointer; font-size:14px; opacity:0; transition:opacity 0.15s, color 0.15s; padding:0 4px; }
        .dg-row:hover .dg-del { opacity:0.6; }
        .dg-del:hover { opacity:1; color:var(--danger); }
        .dg-input { flex:1; background:transparent; border:none; outline:none; font-size:14px; color:var(--text-primary); font-family:var(--font-sans); padding:0; }
      `}</style>
      <div className="section-title" style={{ display:'flex', justifyContent:'space-between' }}>
        <span>Today&apos;s goals</span>
        {total > 0 && (
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color: done === total ? 'var(--success)' : 'var(--text-tertiary)', letterSpacing:'0.04em' }}>
            {done}/{total}
          </span>
        )}
      </div>

      {goals.map(g => {
        const isEditing = editingId === g.id;
        return (
          <div key={g.id} className="dg-row">
            <button
              className={`dg-check${g.done ? ' done' : ''}`}
              onClick={() => toggleDone(g)}
              aria-label={g.done ? 'Mark not done' : 'Mark done'}
            >
              {g.done && (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 6.5L5.2 9.5L11 3.5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            {isEditing ? (
              <input
                className="dg-input"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(g.id); if (e.key === 'Escape') setEditingId(null); }}
                onBlur={() => saveEdit(g.id)}
                autoFocus
              />
            ) : (
              <span
                className={`dg-text${g.done ? ' done' : ''}`}
                onClick={() => { setEditingId(g.id); setEditText(g.text); }}
              >
                {g.text}
              </span>
            )}
            <button className="dg-del" onClick={() => deleteGoal(g.id)} aria-label="Delete goal">×</button>
          </div>
        );
      })}

      {total === 0 && !adding && (
        <div style={{ fontSize:13, color:'var(--text-tertiary)', padding:'4px 0 8px' }}>
          What do you want to make happen today?
        </div>
      )}

      {goals.some(g => !g.done) && total > 0 && (
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
            transition: 'border-color 160ms ease, color 160ms ease',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {pushing ? 'Pushing…' : '↪ Push remaining to tomorrow'}
        </button>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8 }}>
        {adding || total === 0 ? (
          <>
            <span style={{ width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)' }}>+</span>
            <input
              ref={inputRef}
              className="dg-input"
              placeholder="New goal…"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addGoal(); if (e.key === 'Escape') { setAdding(false); setNewText(''); } }}
              autoFocus={adding}
            />
            {adding && (
              <button className="dg-del" style={{ opacity:0.6 }} onClick={() => { setAdding(false); setNewText(''); }}>×</button>
            )}
          </>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{ background:'none', border:'none', color:'var(--text-tertiary)', cursor:'pointer', fontSize:13, padding:'4px 0', fontFamily:'var(--font-sans)' }}
          >
            + Add goal
          </button>
        )}
      </div>
    </div>
  );
}
