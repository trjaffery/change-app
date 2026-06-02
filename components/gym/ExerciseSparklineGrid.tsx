'use client';
import { useCallback, useEffect, useState } from 'react';

interface SetPoint { reps: number; weight: number }
interface HistoryPoint { date: string; maxWeight: number; sets: SetPoint[] }
interface ExerciseRollup {
  exercise: string;
  bodyPart: string | null;
  recent: HistoryPoint[];         // up to 10, ascending by date
  best: { weight: number; reps: number };
  oneRm: number;
  delta: number | null;           // last vs prior maxWeight, null if <2 sessions
}
interface SplitsResponse {
  split_days?: {
    split_exercises?: { exercise: string; body_part: string | null }[];
  }[];
}

const WINDOW_DAYS = 30;
const SPARKLINE_LEN = 10;

function isWithinWindow(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00').getTime();
  return Date.now() - d <= WINDOW_DAYS * 86400000;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 160, H = 36, PX = 2, PY = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => PX + (i / (values.length - 1)) * (W - PX * 2);
  const y = (v: number) => PY + (H - PY * 2) - ((v - min) / range) * (H - PY * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6BE3A4" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#6BE3A4" stopOpacity="0" />
        </linearGradient>
        <filter id="sg-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <polygon points={`${PX},${H - PY} ${pts} ${W - PX},${H - PY}`} fill="url(#sg)" />
      <polyline points={pts} fill="none" stroke="#6BE3A4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" filter="url(#sg-glow)" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill="#FFFFFF" stroke="#6BE3A4" strokeWidth="1.5" filter="url(#sg-glow)" />
    </svg>
  );
}

export default function ExerciseSparklineGrid({ refreshKey }: { refreshKey: number }) {
  const [rollups, setRollups] = useState<ExerciseRollup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exRes, splitsRes] = await Promise.all([
        fetch('/api/gym/exercises'),
        fetch('/api/gym/splits'),
      ]);
      const exercises = (await exRes.json()) as string[];
      if (!Array.isArray(exercises) || exercises.length === 0) {
        setRollups([]);
        return;
      }
      // Build name → body_part map. Last-write-wins if the same exercise lives in multiple split days.
      const splitsData = (await splitsRes.json()) as SplitsResponse[];
      const bodyPartByExercise = new Map<string, string>();
      for (const sp of (Array.isArray(splitsData) ? splitsData : [])) {
        for (const day of (sp.split_days ?? [])) {
          for (const ex of (day.split_exercises ?? [])) {
            if (ex.body_part) bodyPartByExercise.set(ex.exercise, ex.body_part);
          }
        }
      }
      const histories = await Promise.all(
        exercises.map(async ex => {
          const r = await fetch(`/api/gym/history?exercise=${encodeURIComponent(ex)}`);
          const h = (await r.json()) as HistoryPoint[];
          return { exercise: ex, history: Array.isArray(h) ? h : [] };
        })
      );

      const built: ExerciseRollup[] = [];
      for (const { exercise, history } of histories) {
        const inWindow = history.filter(p => isWithinWindow(p.date));
        if (inWindow.length < 2) continue;
        const recent = inWindow.slice(-SPARKLINE_LEN);

        // Best set across window (max weight, ties broken by reps).
        let best: SetPoint = { reps: 0, weight: 0 };
        for (const p of inWindow) {
          for (const s of (p.sets ?? [])) {
            if (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = s;
          }
        }
        // Fallback if sets array was empty: use maxWeight with reps unknown (1).
        if (best.weight === 0) {
          const top = inWindow.reduce((m, p) => p.maxWeight > m ? p.maxWeight : m, 0);
          best = { weight: top, reps: 1 };
        }
        const oneRm = Math.round(best.weight * (1 + best.reps / 30));

        const delta = recent.length >= 2
          ? recent[recent.length - 1].maxWeight - recent[recent.length - 2].maxWeight
          : null;

        built.push({ exercise, bodyPart: bodyPartByExercise.get(exercise) ?? null, recent, best, oneRm, delta });
      }
      // Sort by est. 1RM desc so the heaviest lifts surface first.
      built.sort((a, b) => b.oneRm - a.oneRm);
      setRollups(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return null;
  if (rollups.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .esg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
        .esg-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px;
          padding: 12px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .esg-name {
          font-size: 13px; font-weight: 600; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .esg-meta {
          display: flex; justify-content: space-between; align-items: baseline;
          font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);
          letter-spacing: 0.04em;
        }
        .esg-meta-val { color: var(--text-secondary); font-weight: 600; font-size: 11px; }
        .esg-delta-up { color: var(--success); }
        .esg-delta-dn { color: var(--danger); }
        .esg-delta-eq { color: var(--text-tertiary); }
      `}</style>
      <div className="section-title">Per-exercise · last {WINDOW_DAYS} days</div>
      <div className="esg-grid">
        {rollups.map(r => {
          const deltaCls = r.delta === null ? 'esg-delta-eq' : r.delta > 0 ? 'esg-delta-up' : r.delta < 0 ? 'esg-delta-dn' : 'esg-delta-eq';
          const deltaTxt = r.delta === null ? '—' : r.delta === 0 ? '±0' : `${r.delta > 0 ? '+' : '−'}${Math.abs(r.delta)}`;
          return (
            <div key={r.exercise} className="esg-card">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <div className="esg-name" style={{ flex: 1, minWidth: 0 }} title={r.exercise}>{r.exercise}</div>
                {r.bodyPart && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {r.bodyPart}
                  </span>
                )}
              </div>
              <Sparkline values={r.recent.map(p => p.maxWeight)} />
              <div className="esg-meta">
                <span>best</span>
                <span className="esg-meta-val">{r.best.weight} × {r.best.reps}</span>
              </div>
              <div className="esg-meta">
                <span>est. 1RM</span>
                <span className="esg-meta-val">{r.oneRm} lb</span>
              </div>
              <div className="esg-meta">
                <span>last vs prior</span>
                <span className={`esg-meta-val ${deltaCls}`}>{deltaTxt}{r.delta !== null && r.delta !== 0 ? ' lb' : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
