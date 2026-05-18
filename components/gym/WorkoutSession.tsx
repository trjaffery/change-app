'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

interface SplitExercise { id: string; exercise: string; target_sets: number; target_reps: string }
interface GymSet { id: string; exercise: string; reps: number; weight: number }
interface SetRow { reps: string; weight: string; loggedId: string | null }
interface ExerciseBlock {
  exercise: string;
  splitExId: string | null;
  targetSets: number;
  targetReps: string;
  rows: SetRow[];
  aiState: { label: string; response: string; loading: boolean } | null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function makeRows(count: number, defaultWeight: string, defaultReps: string): SetRow[] {
  return Array.from({ length: count }, () => ({ reps: defaultReps, weight: defaultWeight, loggedId: null }));
}

export default function WorkoutSession({
  splitDayId, dayLabel, onFinish,
}: {
  splitDayId: string | null;
  dayLabel: string;
  onFinish: () => void;
}) {
  const today = getActiveDateString();
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [allExercises, setAllExercises] = useState<string[]>([]);
  const [freeEx, setFreeEx] = useState('');
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);

  // Start session record + timer on mount
  useEffect(() => {
    fetch('/api/gym/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ split_day_id: splitDayId, date: today }),
    }).then(r => r.json()).then(data => {
      setSessionId(data.id);
      sessionIdRef.current = data.id;
    });

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [splitDayId, today]);

  const init = useCallback(async () => {
    setLoading(true);
    const [todaySetsRes, allExRes] = await Promise.all([
      fetch(`/api/gym?date=${today}`),
      fetch('/api/gym/exercises'),
    ]);
    const todaySets: GymSet[] = await todaySetsRes.json();
    setAllExercises(await allExRes.json());

    if (!splitDayId) {
      const map: Record<string, GymSet[]> = {};
      for (const s of todaySets) { if (!map[s.exercise]) map[s.exercise] = []; map[s.exercise].push(s); }
      setBlocks(Object.entries(map).map(([exercise, sets]) => ({
        exercise, splitExId: null, targetSets: sets.length, targetReps: '',
        rows: sets.map(s => ({ reps: String(s.reps), weight: String(s.weight), loggedId: s.id })),
        aiState: null,
      })));
      setLoading(false);
      return;
    }

    const allSplits: { split_days: (SplitExercise & { id: string; split_exercises: SplitExercise[] })[] }[] = await fetch('/api/gym/splits').then(r => r.json());
    let exercises: SplitExercise[] = [];
    for (const sp of allSplits) {
      const day = sp.split_days?.find((d: { id: string }) => d.id === splitDayId);
      if (day) { exercises = (day as unknown as { split_exercises: SplitExercise[] }).split_exercises ?? []; break; }
    }

    const histories = await Promise.all(
      exercises.map(ex => fetch(`/api/gym/history?exercise=${encodeURIComponent(ex.exercise)}`).then(r => r.json()))
    );

    const todayByEx: Record<string, GymSet[]> = {};
    for (const s of todaySets) { if (!todayByEx[s.exercise]) todayByEx[s.exercise] = []; todayByEx[s.exercise].push(s); }

    setBlocks(exercises.map((ex, i) => {
      const hist: { sets: { reps: number; weight: number }[] }[] = histories[i] ?? [];
      const lastWeight = hist.length > 0 ? String(hist[hist.length - 1].sets.at(-1)?.weight ?? '') : '';
      const logged = todayByEx[ex.exercise] ?? [];
      let rows: SetRow[];
      if (logged.length > 0) {
        rows = logged.map(s => ({ reps: String(s.reps), weight: String(s.weight), loggedId: s.id }));
        while (rows.length < ex.target_sets) rows.push({ reps: ex.target_reps.split('-')[0], weight: lastWeight, loggedId: null });
      } else {
        rows = makeRows(ex.target_sets, lastWeight, ex.target_reps.split('-')[0]);
      }
      return { exercise: ex.exercise, splitExId: ex.id, targetSets: ex.target_sets, targetReps: ex.target_reps, rows, aiState: null };
    }));
    setLoading(false);
  }, [splitDayId, today]);

  useEffect(() => { init(); }, [init]);

  async function endWorkout() {
    if (timerRef.current) clearInterval(timerRef.current);
    const sid = sessionIdRef.current;
    if (sid) {
      await fetch(`/api/gym/sessions/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ended_at: new Date().toISOString(), duration_seconds: elapsedRef.current }),
      });
    }
    onFinish();
  }

  function updateRow(bi: number, ri: number, field: 'reps' | 'weight', value: string) {
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, rows: b.rows.map((r, j) => j !== ri ? r : { ...r, [field]: value }) }));
  }

  async function logSet(bi: number, ri: number) {
    const block = blocks[bi];
    const row = block.rows[ri];
    if (!row.reps || !row.weight || row.loggedId) return;
    const res = await fetch('/api/gym', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, exercise: block.exercise, reps: Number(row.reps), weight: Number(row.weight), split_day_id: splitDayId }),
    });
    const saved: GymSet = await res.json();
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, rows: b.rows.map((r, j) => j !== ri ? r : { ...r, loggedId: saved.id }) }));
  }

  async function unlogSet(bi: number, ri: number) {
    const row = blocks[bi].rows[ri];
    if (!row.loggedId) return;
    await fetch(`/api/gym/${row.loggedId}`, { method: 'DELETE' });
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, rows: b.rows.map((r, j) => j !== ri ? r : { ...r, loggedId: null }) }));
  }

  function addSetRow(bi: number) {
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : {
      ...b, rows: [...b.rows, { reps: b.targetReps.split('-')[0] || '', weight: b.rows.at(-1)?.weight ?? '', loggedId: null }],
    }));
  }

  async function addFreeExercise() {
    if (!freeEx.trim()) return;
    setBlocks(prev => [...prev, { exercise: freeEx.trim(), splitExId: null, targetSets: 3, targetReps: '', rows: makeRows(3, '', ''), aiState: null }]);
    setFreeEx('');
  }

  async function suggestAI(bi: number) {
    const block = blocks[bi];
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, aiState: { label: '', response: '', loading: true } }));
    const hist: { date: string; sets: { reps: number; weight: number }[] }[] = await fetch(`/api/gym/history?exercise=${encodeURIComponent(block.exercise)}`).then(r => r.json());
    const sessions = hist.slice(-3);
    if (!sessions.length) {
      setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, aiState: { label: '', response: 'No history yet.', loading: false } }));
      return;
    }
    const data = await fetch('/api/ai/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise: block.exercise, sessions }) }).then(r => r.json());
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : {
      ...b,
      aiState: data.error
        ? { label: '', response: data.error, loading: false }
        : { label: `${data.sets} × ${data.reps} @ ${data.weight} lbs`, response: data.notes, loading: false },
    }));
  }

  const doneCount = blocks.reduce((n, b) => n + b.rows.filter(r => r.loggedId).length, 0);

  if (loading) return <div style={{ minHeight: 200 }} />;

  return (
    <>
      <style>{`
        .ws-exercise { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:14px; padding:16px 18px; margin-bottom:12px; }
        .ws-set-row { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:9px; background:rgba(255,255,255,0.025); margin-bottom:5px; }
        .ws-set-row.done { background:rgba(107,227,164,0.06); border:1px solid rgba(107,227,164,0.15); }
        .ws-num-input { width:70px; font-family:var(--font-mono); font-size:13px; }
        .ws-check { width:30px; height:30px; border-radius:8px; border:1px solid rgba(107,227,164,0.35); background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.15s; }
        .ws-check.done { background:rgba(107,227,164,0.15); border-color:var(--success); }
        .ws-check:disabled { opacity:0.3; cursor:default; }
        .ws-suggest { font-size:11px; padding:5px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04); color:var(--text-secondary); cursor:pointer; transition:background 0.15s; }
        .ws-suggest:hover { background:rgba(255,255,255,0.08); }
      `}</style>

      {/* Timer bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 14, background: 'rgba(107,227,164,0.06)', border: '1px solid rgba(107,227,164,0.18)', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{dayLabel}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
            {doneCount} set{doneCount !== 1 ? 's' : ''} logged
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--success)' }}>
          {formatTime(elapsed)}
        </div>
        <button
          className="btn-danger"
          style={{ padding: '10px 18px', fontSize: 13 }}
          onClick={endWorkout}
        >
          End
        </button>
      </div>

      {/* Exercise blocks */}
      {blocks.map((block, bi) => (
        <div key={`${block.exercise}-${bi}`} className="ws-exercise">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{block.exercise}</div>
              {block.targetReps && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {block.targetSets} × {block.targetReps}
                </div>
              )}
            </div>
            <button className="ws-suggest" disabled={block.aiState?.loading} onClick={() => suggestAI(bi)}>
              {block.aiState?.loading ? '…' : 'AI suggest'}
            </button>
          </div>

          {block.rows.map((row, ri) => (
            <div key={ri} className={`ws-set-row${row.loggedId ? ' done' : ''}`}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', width: 44, flexShrink: 0 }}>Set {ri + 1}</span>
              <input className="text-input ws-num-input" type="number" min={1} placeholder="Reps"
                value={row.reps} disabled={!!row.loggedId} onChange={e => updateRow(bi, ri, 'reps', e.target.value)} />
              <input className="text-input ws-num-input" type="number" min={0} step={0.5} placeholder="lbs"
                value={row.weight} disabled={!!row.loggedId} onChange={e => updateRow(bi, ri, 'weight', e.target.value)} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>lbs</span>
              <button className={`ws-check${row.loggedId ? ' done' : ''}`} onClick={() => row.loggedId ? unlogSet(bi, ri) : logSet(bi, ri)}>
                {row.loggedId && <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5L5.2 9.5L11 3.5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
            </div>
          ))}

          <button className="btn-secondary" style={{ marginTop: 8, padding: '6px 14px', fontSize: 12 }} onClick={() => addSetRow(bi)}>
            + Set
          </button>

          {block.aiState && !block.aiState.loading && (
            <div className="ai-response" style={{ display: 'block', marginTop: 10 }}>
              {block.aiState.label && <strong style={{ display: 'block', marginBottom: 4 }}>{block.aiState.label}</strong>}
              {block.aiState.response}
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
        <input className="text-input" list="ws-ex-suggestions" placeholder="Add exercise…"
          value={freeEx} onChange={e => setFreeEx(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addFreeExercise()} style={{ flex: 1 }} />
        <datalist id="ws-ex-suggestions">{allExercises.map(e => <option key={e} value={e} />)}</datalist>
        <button className="btn-secondary" style={{ padding: '10px 16px', fontSize: 13 }} onClick={addFreeExercise}>+ Add</button>
      </div>
    </>
  );
}
