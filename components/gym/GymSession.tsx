'use client';
import { useCallback, useEffect, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

interface GymSet { id: string; exercise: string; reps: number; weight: number; position: number }
interface ExerciseGroup { exercise: string; sets: GymSet[] }

export default function GymSession({ onExercisesChange }: { onExercisesChange?: () => void }) {
  const today = getActiveDateString();
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [exerciseInput, setExerciseInput] = useState('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<Record<string, { label: string; response: string; loading: boolean }>>({});

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/gym?date=${today}`);
    const sets: GymSet[] = await res.json();
    // Group by exercise
    const map: Record<string, GymSet[]> = {};
    for (const s of sets) {
      if (!map[s.exercise]) map[s.exercise] = [];
      map[s.exercise].push(s);
    }
    setGroups(Object.entries(map).map(([exercise, sets]) => ({ exercise, sets })));
    setLoading(false);
  }, [today]);

  const fetchSuggestions = useCallback(async () => {
    const res = await fetch('/api/gym/exercises');
    setSuggestions(await res.json());
  }, []);

  useEffect(() => { fetchSession(); fetchSuggestions(); }, [fetchSession, fetchSuggestions]);

  async function logSet() {
    if (!exerciseInput.trim() || !reps || !weight) return;
    await fetch('/api/gym', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, exercise: exerciseInput.trim(), reps: Number(reps), weight: Number(weight) }),
    });
    setReps(''); setWeight('');
    fetchSession(); fetchSuggestions(); onExercisesChange?.();
  }

  async function deleteSet(id: string) {
    await fetch(`/api/gym/${id}`, { method: 'DELETE' });
    fetchSession(); onExercisesChange?.();
  }

  async function suggestNext(exercise: string) {
    setSuggestion(prev => ({ ...prev, [exercise]: { label: '', response: '', loading: true } }));
    const histRes = await fetch(`/api/gym/history?exercise=${encodeURIComponent(exercise)}`);
    const history: { date: string; sets: { reps: number; weight: number }[] }[] = await histRes.json();
    const sessions = history.slice(-3);
    if (sessions.length === 0) {
      setSuggestion(prev => ({ ...prev, [exercise]: { label: '', response: 'No history yet.', loading: false } }));
      return;
    }
    const res = await fetch('/api/ai/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise, sessions }),
    });
    const data = await res.json();
    if (data.error) {
      setSuggestion(prev => ({ ...prev, [exercise]: { label: '', response: data.error === 'no_key' ? 'Add your Anthropic API key to use AI suggestions.' : data.error, loading: false } }));
      return;
    }
    setSuggestion(prev => ({
      ...prev,
      [exercise]: { label: `${data.sets} sets × ${data.reps} reps @ ${data.weight} lbs`, response: data.notes, loading: false },
    }));
  }

  if (loading) return <div style={{ height: 60 }} />;

  return (
    <>
      <style>{`
        .gym-ex-group { background:rgba(255,255,255,0.035); border-radius:14px; border:1px solid rgba(255,255,255,0.06); padding:14px 16px; margin-bottom:10px; }
        .gym-ex-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .gym-set-item { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:8px; background:rgba(255,255,255,0.02); margin-bottom:4px; font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); }
        .gym-set-del { margin-left:auto; background:none; border:none; color:var(--text-tertiary); cursor:pointer; opacity:0; font-size:14px; transition:opacity 0.15s,color 0.15s; padding:0 2px; }
        .gym-ex-group:hover .gym-set-del { opacity:0.5; }
        .gym-set-del:hover { color:var(--danger) !important; opacity:1 !important; }
        .gym-suggest-btn { font-size:11px; padding:5px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04); color:var(--text-secondary); cursor:pointer; white-space:nowrap; font-family:var(--font-sans); transition:background 0.2s; }
        .gym-suggest-btn:hover { background:rgba(255,255,255,0.08); }
        .gym-suggest-btn:disabled { opacity:0.5; cursor:wait; }
        .gym-form { display:flex; flex-direction:column; gap:10px; }
        .gym-set-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .gym-input-sm { width:100px; }
      `}</style>

      {/* Log form */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-title">Log a Set</div>
        <div className="gym-form">
          <input
            className="text-input" list="gym-suggestions"
            placeholder="Exercise name (e.g. Bench Press)…"
            style={{ width: '100%' }}
            value={exerciseInput}
            onChange={e => setExerciseInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && logSet()}
          />
          <datalist id="gym-suggestions">
            {suggestions.map(s => <option key={s} value={s} />)}
          </datalist>
          <div className="gym-set-row">
            <input className={`text-input gym-input-sm`} type="number" placeholder="Reps" min="1" value={reps} onChange={e => setReps(e.target.value)} onKeyDown={e => e.key === 'Enter' && logSet()} />
            <input className={`text-input gym-input-sm`} type="number" placeholder="Weight (lbs)" min="0" step="0.5" value={weight} onChange={e => setWeight(e.target.value)} onKeyDown={e => e.key === 'Enter' && logSet()} />
            <button className="btn-primary" style={{ padding: '10px 18px', fontSize: 13 }} onClick={logSet}>Log Set</button>
          </div>
        </div>
      </div>

      {/* Today's session */}
      <div style={{ marginBottom: 22 }}>
        <div className="section-title">Today&apos;s Session</div>
        {groups.length === 0 && <div className="empty-state">No sets logged today — add one above.</div>}
        {groups.map(({ exercise, sets }) => (
          <div key={exercise} className="gym-ex-group">
            <div className="gym-ex-header">
              <div style={{ fontSize: 13, fontWeight: 700 }}>{exercise}</div>
              <button
                className="gym-suggest-btn"
                disabled={suggestion[exercise]?.loading}
                onClick={() => suggestNext(exercise)}
              >
                {suggestion[exercise]?.loading ? '…' : '✨ Suggest next session'}
              </button>
            </div>
            {sets.map((set, i) => (
              <div key={set.id} className="gym-set-item">
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Set {i + 1}</span>
                <span style={{ fontWeight: 600 }}>{set.reps} reps</span>
                <span style={{ color: 'var(--text-tertiary)' }}>@</span>
                <span style={{ fontWeight: 600 }}>{set.weight} lbs</span>
                <button className="gym-set-del" onClick={() => deleteSet(set.id)}>×</button>
              </div>
            ))}
            {suggestion[exercise] && !suggestion[exercise].loading && (
              <div className="ai-response" style={{ display: 'block', marginTop: 10 }}>
                {suggestion[exercise].label && <strong style={{ display: 'block', marginBottom: 4 }}>{suggestion[exercise].label}</strong>}
                {suggestion[exercise].response}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
