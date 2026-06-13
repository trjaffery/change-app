'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';
import { suggestNext } from '@/lib/gym-progression';
import BottomSheet from '@/components/layout/BottomSheet';

interface WorkoutSummary {
  totals: { volume: number; sets: number; exercises: number; duration_minutes: number | null };
  prs: { exercise: string; weight: number; reps: number; previous: number }[];
  volume_delta_pct: number | null;
  prior_avg_volume: number | null;
  note: string | null;
}
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
  lastSet: { weight: number; reps: number; daysAgo: number } | null;
}

function daysBetween(isoDate: string): number {
  const past = new Date(isoDate + 'T12:00:00').getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - past) / 86400000));
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
  splitDayId, dayLabel, onFinish, restDuration = 90,
}: {
  splitDayId: string | null;
  dayLabel: string;
  onFinish: () => void;
  restDuration?: number;
}) {
  const today = getActiveDateString();
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [allExercises, setAllExercises] = useState<string[]>([]);
  const [freeEx, setFreeEx] = useState('');
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restingAt, setRestingAt] = useState<{ bi: number; ri: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionCreatedRef = useRef(false);
  const elapsedRef = useRef(0);
  // Finish modal
  const [showFinish, setShowFinish] = useState(false);
  const [finishRpe, setFinishRpe] = useState<number | null>(null);
  const [finishNotes, setFinishNotes] = useState('');
  const [finishing, setFinishing] = useState(false);
  // Post-workout summary sheet
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Create session record once — guard prevents StrictMode double-fire
  useEffect(() => {
    if (sessionCreatedRef.current) return;
    sessionCreatedRef.current = true;
    fetch('/api/gym/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ split_day_id: splitDayId, date: today }),
    }).then(r => r.json()).then(data => {
      sessionIdRef.current = data.id;
    });
  }, [splitDayId, today]);

  // Workout timer — separate effect so it restarts cleanly after StrictMode remount
  useEffect(() => {
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, []);

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
        lastSet: null,
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
      const hist: { date: string; sets: { reps: number; weight: number }[] }[] = histories[i] ?? [];
      const lastSession = hist.length > 0 ? hist[hist.length - 1] : null;
      const lastWeight = lastSession ? String(lastSession.sets.at(-1)?.weight ?? '') : '';
      // Last-set summary: heaviest set of the previous session, ties broken by reps.
      let lastSet: ExerciseBlock['lastSet'] = null;
      if (lastSession && lastSession.sets.length > 0) {
        const top = lastSession.sets.reduce(
          (best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
          lastSession.sets[0],
        );
        lastSet = { weight: top.weight, reps: top.reps, daysAgo: daysBetween(lastSession.date) };
      }
      const logged = todayByEx[ex.exercise] ?? [];
      let rows: SetRow[];
      if (logged.length > 0) {
        rows = logged.map(s => ({ reps: String(s.reps), weight: String(s.weight), loggedId: s.id }));
        while (rows.length < ex.target_sets) rows.push({ reps: ex.target_reps.split('-')[0], weight: lastWeight, loggedId: null });
      } else {
        rows = makeRows(ex.target_sets, lastWeight, ex.target_reps.split('-')[0]);
      }
      return { exercise: ex.exercise, splitExId: ex.id, targetSets: ex.target_sets, targetReps: ex.target_reps, rows, aiState: null, lastSet };
    }));
    setLoading(false);
  }, [splitDayId, today]);

  useEffect(() => { init(); }, [init]);

  function startRest(bi: number, ri: number) {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setRestingAt({ bi, ri });
    setRestRemaining(restDuration);
    let remaining = restDuration;
    restTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(restTimerRef.current!);
        restTimerRef.current = null;
        setRestRemaining(null);
        setRestingAt(null);
      } else {
        setRestRemaining(remaining);
      }
    }, 1000);
  }

  function skipRest() {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = null;
    setRestRemaining(null);
    setRestingAt(null);
  }

  async function endWorkout(rpe: number | null, notes: string) {
    setFinishing(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    const sid = sessionIdRef.current;
    if (sid) {
      const body: Record<string, unknown> = { ended_at: new Date().toISOString(), duration_seconds: elapsedRef.current };
      if (rpe !== null) body.rpe = rpe;
      const trimmed = notes.trim();
      if (trimmed) body.notes = trimmed;
      await fetch(`/api/gym/sessions/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Compute the post-workout summary. Deterministic totals + PRs are cheap;
      // the AI note (optional) lives inside the same response.
      try {
        const sumRes = await fetch('/api/ai/workout-summary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid }),
        });
        if (sumRes.ok) {
          const s = await sumRes.json() as WorkoutSummary;
          setSummary(s);
          setShowFinish(false);
          setShowSummary(true);
          setFinishing(false);
          return;
        }
      } catch { /* fall through to onFinish */ }
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
    startRest(bi, ri);
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
    setBlocks(prev => [...prev, { exercise: freeEx.trim(), splitExId: null, targetSets: 3, targetReps: '', rows: makeRows(3, '', ''), aiState: null, lastSet: null }]);
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
    const data = suggestNext(block.exercise, sessions, block.targetSets, block.targetReps);
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : {
      ...b,
      aiState: data
        ? { label: `${data.sets} × ${data.reps} @ ${data.weight} lbs`, response: data.notes, loading: false }
        : { label: '', response: 'No history yet.', loading: false },
    }));
  }

  const doneCount = blocks.reduce((n, b) => n + b.rows.filter(r => r.loggedId).length, 0);

  if (loading) return <div style={{ minHeight: 200 }} />;

  return (
    <>
      <style>{`
        /* ─────────────────────────────────────────────────────────────────
           Workout session — "printout" aesthetic.
           Mono numbers dominate; labels are tiny uppercase mono; each section
           is a flat strip separated by thin rules. Rows are 38px tall.
           ───────────────────────────────────────────────────────────────── */

        /* Sticky timer bar — slim, glass, accessible from anywhere on the page */
        .ws-timer {
          position: sticky;
          top: calc(env(safe-area-inset-top) + 8px);
          z-index: 20;
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          margin-bottom: 18px;
          border-radius: 14px;
          background: rgba(8,8,10,0.82);
          border: 1px solid rgba(107,227,164,0.22);
          backdrop-filter: blur(22px) saturate(1.3);
          -webkit-backdrop-filter: blur(22px) saturate(1.3);
          box-shadow: 0 10px 28px rgba(0,0,0,0.42);
        }
        .ws-timer-meta { min-width: 0; }
        .ws-timer-day {
          font-size: 12px; font-weight: 600; color: var(--text-secondary);
          letter-spacing: -0.005em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ws-timer-progress {
          font-family: var(--font-mono);
          font-size: 9.5px; color: var(--text-tertiary);
          letter-spacing: 0.08em; text-transform: uppercase;
          margin-top: 2px;
        }
        .ws-timer-clock {
          font-family: var(--font-mono);
          font-size: 28px; font-weight: 700; letter-spacing: -0.04em;
          color: var(--success); font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .ws-timer-end {
          padding: 9px 16px;
          font-family: var(--font-mono);
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          border-radius: 10px;
          border: 1px solid rgba(255,107,107,0.32);
          background: rgba(255,107,107,0.08);
          color: var(--danger);
          cursor: pointer;
          min-height: 38px;
          transition: background 160ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ws-timer-end:active { transform: scale(0.97); }

        /* Top-level progress dots — one per planned set */
        .ws-dots {
          display: flex; gap: 4px; flex-wrap: wrap;
          margin: -8px 2px 18px;
          padding: 0 2px;
        }
        .ws-dot {
          flex: 1 1 0; height: 3px; min-width: 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          transition: background 240ms ease, box-shadow 240ms ease;
        }
        .ws-dot.done {
          background: var(--success);
          box-shadow: 0 0 8px rgba(107,227,164,0.55);
        }

        /* ─── EXERCISE SECTION ───────────────────────────────────────── */
        .ws-section {
          margin-bottom: 18px;
        }
        .ws-section + .ws-section {
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .ws-section-head {
          display: flex; align-items: baseline; gap: 8px;
          margin-bottom: 8px;
        }
        .ws-section-num {
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          color: var(--text-tertiary);
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .ws-section-name {
          font-family: var(--font-mono);
          font-size: 13px; font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ws-section-target {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }
        .ws-section-last {
          font-family: var(--font-mono);
          font-size: 10px;
          color: rgba(107,227,164,0.78);
          letter-spacing: 0.02em;
          margin-left: auto;
          flex-shrink: 0;
        }
        .ws-section-ai {
          width: 28px; height: 28px;
          padding: 0;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: var(--text-tertiary);
          font-size: 14px; line-height: 1;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 160ms ease, color 160ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ws-section-ai:hover, .ws-section-ai:focus-visible {
          background: rgba(255,255,255,0.05);
          color: var(--text-primary);
        }
        .ws-section-ai:active { transform: scale(0.96); }

        /* ─── SET ROW ─────────────────────────────────────────────────── */
        .ws-set {
          display: grid;
          grid-template-columns: 22px 1fr 12px 1fr 22px 38px;
          align-items: center;
          gap: 8px;
          height: 42px;
          padding: 0 8px;
          border-radius: 10px;
          position: relative;
        }
        .ws-set + .ws-set { margin-top: 2px; }
        .ws-set.active {
          background: rgba(107,227,164,0.05);
        }
        .ws-set.active::before {
          content: '';
          position: absolute; left: -2px; top: 8px; bottom: 8px;
          width: 2px; border-radius: 2px;
          background: var(--success);
          box-shadow: 0 0 8px rgba(107,227,164,0.55);
        }
        .ws-set.logged { opacity: 0.72; }

        .ws-set-idx {
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          color: var(--text-tertiary);
          letter-spacing: 0.04em;
          text-align: center;
        }
        .ws-set-num {
          font-family: var(--font-mono);
          font-size: 19px; font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--text-primary);
          letter-spacing: -0.02em;
          text-align: right;
          line-height: 1;
        }
        .ws-set.logged .ws-set-num { color: var(--success); }
        .ws-set-x {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-tertiary);
          text-align: center;
        }
        .ws-set-input {
          font-family: var(--font-mono);
          font-size: 19px; font-weight: 700;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          padding: 0;
          text-align: right;
          width: 100%;
          min-width: 0;
        }
        .ws-set-input::placeholder { color: rgba(255,255,255,0.18); font-weight: 600; }
        /* Hide native number-input spinners */
        .ws-set-input::-webkit-outer-spin-button,
        .ws-set-input::-webkit-inner-spin-button {
          -webkit-appearance: none; margin: 0;
        }
        .ws-set-input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
        .ws-set-unit {
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-align: left;
        }
        .ws-set-check {
          width: 30px; height: 30px;
          border-radius: 8px;
          border: 1px solid rgba(107,227,164,0.32);
          background: transparent;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: background 140ms ease, border-color 140ms ease, transform 100ms ease;
          -webkit-tap-highlight-color: transparent;
          padding: 0;
          /* Ensure 44pt touch target via larger hit area */
          margin: 7px 4px;
        }
        .ws-set-check.done {
          background: rgba(107,227,164,0.18);
          border-color: var(--success);
        }
        .ws-set-check:disabled { opacity: 0.28; cursor: default; }
        .ws-set-check:not(:disabled):active { transform: scale(0.92); }

        /* Slim rest-timer strip below the row that triggered it */
        .ws-rest {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 12px;
          height: 30px;
          padding: 0 10px;
          margin: 4px 0 2px;
          border-radius: 8px;
          background: rgba(242,192,99,0.07);
          border: 1px solid rgba(242,192,99,0.22);
        }
        .ws-rest-label {
          font-family: var(--font-mono);
          font-size: 9px; font-weight: 700;
          color: #F2C063;
          letter-spacing: 0.18em; text-transform: uppercase;
        }
        .ws-rest-time {
          font-family: var(--font-mono);
          font-size: 14px; font-weight: 700;
          color: #F2C063;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .ws-rest-skip {
          background: transparent;
          border: none;
          color: rgba(242,192,99,0.8);
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
          cursor: pointer; padding: 4px 8px; border-radius: 4px;
          -webkit-tap-highlight-color: transparent;
        }

        .ws-add-set {
          margin-top: 6px;
          padding: 6px 10px;
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.16em; text-transform: uppercase;
          cursor: pointer;
          transition: color 140ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ws-add-set:hover { color: var(--text-secondary); }

        .ws-ai {
          margin-top: 8px; padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          font-size: 12px; line-height: 1.55; color: var(--text-secondary);
        }
        .ws-ai strong {
          display: block;
          font-family: var(--font-mono); font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--success);
          margin-bottom: 4px;
        }

        /* Add freeform exercise at bottom — tiny, unobtrusive */
        .ws-add-ex {
          display: flex; align-items: center; gap: 6px;
          margin-top: 22px; padding: 8px 10px;
          border: 1px dashed rgba(255,255,255,0.10);
          border-radius: 10px;
          background: transparent;
        }
        .ws-add-ex input {
          flex: 1; min-width: 0;
          background: transparent; border: none; outline: none;
          font-family: var(--font-sans); font-size: 14px;
          color: var(--text-primary);
          padding: 4px 2px;
          min-height: 32px;
        }
        .ws-add-ex input::placeholder { color: var(--text-tertiary); }
        .ws-add-ex button {
          background: transparent; border: none;
          color: var(--text-tertiary);
          font-family: var(--font-mono); font-size: 16px; font-weight: 600;
          padding: 4px 10px; cursor: pointer;
          min-height: 32px;
          -webkit-tap-highlight-color: transparent;
        }

        @media (max-width: 640px) {
          .ws-timer-clock { font-size: 24px; }
          .ws-set { height: 40px; }
        }
      `}</style>

      {/* Sticky timer bar */}
      <div className="ws-timer">
        <div className="ws-timer-meta">
          <div className="ws-timer-day">{dayLabel || 'Free workout'}</div>
          <div className="ws-timer-progress">
            {doneCount} / {blocks.reduce((n, b) => n + b.rows.length, 0)} sets
          </div>
        </div>
        <div className="ws-timer-clock">{formatTime(elapsed)}</div>
        <button className="ws-timer-end" onClick={() => setShowFinish(true)}>End</button>
      </div>

      {/* Progress dots — one per planned set, top of session view */}
      {blocks.length > 0 && (
        <div className="ws-dots" aria-hidden>
          {blocks.flatMap((b, bi) =>
            b.rows.map((r, ri) => (
              <span key={`${bi}-${ri}`} className={`ws-dot${r.loggedId ? ' done' : ''}`} />
            ))
          )}
        </div>
      )}

      <BottomSheet
        open={showFinish}
        onClose={() => !finishing && setShowFinish(false)}
        title="How did it feel?"
        disableBackdropClose={finishing}
      >
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          RPE and notes are optional — skip if you don&apos;t track them.
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>RPE</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
            const isSel = finishRpe === n;
            const tone = n <= 4 ? '#6BE3A4' : n <= 7 ? '#F2C063' : '#FF6B6B';
            return (
              <button
                key={n}
                onClick={() => setFinishRpe(isSel ? null : n)}
                style={{
                  flex: '1 1 0', minWidth: 32, height: 40, borderRadius: 10,
                  background: isSel ? `${tone}26` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isSel ? `${tone}88` : 'rgba(255,255,255,0.08)'}`,
                  color: isSel ? tone : 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Notes</div>
        <textarea
          value={finishNotes}
          onChange={e => setFinishNotes(e.target.value)}
          placeholder="Energy, form, pain, anything to remember…"
          rows={3}
          style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'var(--font-sans)', outline: 'none', marginBottom: 18 }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" style={{ fontSize: 13 }} disabled={finishing} onClick={() => endWorkout(null, '')}>Skip & end</button>
          <button className="btn-primary" style={{ fontSize: 13 }} disabled={finishing} onClick={() => endWorkout(finishRpe, finishNotes)}>
            {finishing ? 'Saving…' : 'Save & finish'}
          </button>
        </div>
      </BottomSheet>

      {/* Post-workout summary — deterministic totals + optional AI calibration note */}
      <BottomSheet
        open={showSummary}
        onClose={() => { setShowSummary(false); onFinish(); }}
        title="Session done"
      >
        {summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <SummaryStat label="Volume" value={`${summary.totals.volume.toLocaleString()}`} unit="lb-reps" />
              <SummaryStat label="Sets" value={`${summary.totals.sets}`} unit={`${summary.totals.exercises} ex`} />
              <SummaryStat label="Duration" value={summary.totals.duration_minutes !== null ? `${summary.totals.duration_minutes}` : '—'} unit="min" />
            </div>

            {summary.volume_delta_pct !== null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                {summary.volume_delta_pct >= 0 ? '+' : ''}{summary.volume_delta_pct.toFixed(0)}% vs your last 3 of this day
              </div>
            )}

            {summary.prs.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--success)', marginBottom: 8 }}>New PRs</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {summary.prs.map((p, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 14, background: 'rgba(107,227,164,0.1)', border: '1px solid rgba(107,227,164,0.25)', color: 'var(--success)' }}>
                      {p.exercise} {p.weight} lb (prev {p.previous})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {summary.note && (
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', borderLeft: '2px solid var(--success)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                {summary.note}
              </div>
            )}

            <button className="btn-primary" style={{ width: '100%', fontSize: 14, padding: '12px 18px' }} onClick={() => { setShowSummary(false); onFinish(); }}>Done</button>
          </div>
        )}
      </BottomSheet>

      {/* Exercise sections — flat, dense, mono-driven */}
      {blocks.map((block, bi) => {
        // Index of the first un-logged row in this block; that's the "active" set.
        const activeIdx = block.rows.findIndex(r => !r.loggedId);
        const lastTone = block.lastSet?.daysAgo === 0 ? 'today'
          : block.lastSet?.daysAgo === 1 ? 'yest'
          : `${block.lastSet?.daysAgo}d`;
        return (
          <section key={`${block.exercise}-${bi}`} className="ws-section">
            <header className="ws-section-head">
              <span className="ws-section-num">{String(bi + 1).padStart(2, '0')}</span>
              <span className="ws-section-name">{block.exercise}</span>
              {block.targetReps && (
                <span className="ws-section-target">· {block.targetSets}×{block.targetReps}</span>
              )}
              {block.lastSet && (
                <span className="ws-section-last">
                  ↘ {block.lastSet.weight}×{block.lastSet.reps} · {lastTone}
                </span>
              )}
              <button
                className="ws-section-ai"
                disabled={block.aiState?.loading}
                onClick={() => suggestAI(bi)}
                aria-label="AI suggest"
                title="AI suggestion"
              >
                {block.aiState?.loading ? '…' : '✦'}
              </button>
            </header>

            {block.rows.map((row, ri) => {
              const logged = !!row.loggedId;
              const isActive = !logged && ri === activeIdx;
              const canLog = !logged && !!row.reps && !!row.weight;
              return (
                <Fragment key={ri}>
                  <div className={`ws-set${logged ? ' logged' : isActive ? ' active' : ''}`}>
                    <span className="ws-set-idx">{String(ri + 1).padStart(2, '0')}</span>
                    {logged ? (
                      <span className="ws-set-num">{row.reps}</span>
                    ) : (
                      <input
                        className="ws-set-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder="—"
                        value={row.reps}
                        onChange={e => updateRow(bi, ri, 'reps', e.target.value)}
                      />
                    )}
                    <span className="ws-set-x">×</span>
                    {logged ? (
                      <span className="ws-set-num">{row.weight}</span>
                    ) : (
                      <input
                        className="ws-set-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.5}
                        placeholder="—"
                        value={row.weight}
                        onChange={e => updateRow(bi, ri, 'weight', e.target.value)}
                      />
                    )}
                    <span className="ws-set-unit">lb</span>
                    <button
                      className={`ws-set-check${logged ? ' done' : ''}`}
                      disabled={!logged && !canLog}
                      onClick={() => logged ? unlogSet(bi, ri) : logSet(bi, ri)}
                      aria-label={logged ? 'Un-log set' : 'Log set'}
                    >
                      {logged && (
                        <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
                          <path d="M2 6.5L5.2 9.5L11 3.5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {restingAt?.bi === bi && restingAt?.ri === ri && restRemaining !== null && (
                    <div className="ws-rest">
                      <span className="ws-rest-label">Rest</span>
                      <span className="ws-rest-time">{formatTime(restRemaining)}</span>
                      <button className="ws-rest-skip" onClick={skipRest}>Skip</button>
                    </div>
                  )}
                </Fragment>
              );
            })}

            <button className="ws-add-set" onClick={() => addSetRow(bi)}>
              + Add set
            </button>

            {block.aiState && !block.aiState.loading && (
              <div className="ws-ai">
                {block.aiState.label && <strong>{block.aiState.label}</strong>}
                {block.aiState.response}
              </div>
            )}
          </section>
        );
      })}

      <div className="ws-add-ex">
        <input
          list="ws-ex-suggestions"
          placeholder="Add exercise"
          value={freeEx}
          onChange={e => setFreeEx(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addFreeExercise()}
          autoCapitalize="words"
        />
        <datalist id="ws-ex-suggestions">{allExercises.map(e => <option key={e} value={e} />)}</datalist>
        <button onClick={addFreeExercise} aria-label="Add exercise">+</button>
      </div>
    </>
  );
}

function SummaryStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ padding: '12px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4, letterSpacing: '0.08em' }}>{unit}</div>
    </div>
  );
}
