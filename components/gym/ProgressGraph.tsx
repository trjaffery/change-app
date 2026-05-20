'use client';
import { useCallback, useEffect, useState } from 'react';

interface HistoryPoint { date: string; maxWeight: number; sets: { reps: number; weight: number }[] }

export default function ProgressGraph({ refreshKey }: { refreshKey: number }) {
  const [exercises, setExercises] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [plateauTip, setPlateauTip] = useState<string | null>(null);
  const [plateauLoading, setPlateauLoading] = useState(false);

  const fetchExercises = useCallback(async () => {
    const res = await fetch('/api/gym/exercises');
    const list: string[] = await res.json();
    setExercises(list);
  }, []);

  useEffect(() => { fetchExercises(); }, [fetchExercises, refreshKey]);

  useEffect(() => {
    if (!selected) { setHistory([]); setPlateauTip(null); return; }
    setLoading(true);
    setPlateauTip(null);
    fetch(`/api/gym/history?exercise=${encodeURIComponent(selected)}`)
      .then(r => r.json())
      .then(data => { setHistory(data); setLoading(false); });
  }, [selected]);

  async function getPlateauTip() {
    const storedRest = localStorage.getItem('gymRestDuration');
    const restSeconds = storedRest ? Number(storedRest) : 90;
    setPlateauLoading(true);
    try {
      const res = await fetch('/api/ai/plateau', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise: selected,
          sessions: history.slice(-4).map(h => ({ date: h.date, maxWeight: h.maxWeight })),
          restSeconds,
        }),
      });
      const data = await res.json() as { suggestion?: string };
      setPlateauTip(data.suggestion ?? null);
    } finally {
      setPlateauLoading(false);
    }
  }

  const isPlateauing = history.length >= 4 && (() => {
    const last = history.slice(-4);
    const ref = last[0].maxWeight;
    return last.every(p => Math.abs(p.maxWeight - ref) / ref <= 0.025);
  })();

  const W = 500, H = 140, PAD = { top: 16, right: 16, bottom: 40, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  function renderChart() {
    if (!selected) return <div className="empty-state">Select an exercise to view progress.</div>;
    if (loading) return <div className="empty-state">Loading…</div>;
    if (history.length < 2) return <div className="empty-state">{history.length === 0 ? 'No sessions logged yet.' : 'Log at least 2 sessions to see a graph.'}</div>;

    const weights = history.map(d => d.maxWeight);
    const minW = Math.min(...weights), maxW = Math.max(...weights);
    const range = maxW - minW || 1;
    const xScale = (i: number) => PAD.left + (i / (history.length - 1)) * chartW;
    const yScale = (w: number) => PAD.top + chartH - ((w - minW) / range) * chartH;
    const points = history.map((d, i) => `${xScale(i)},${yScale(d.maxWeight)}`).join(' ');

    return (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = PAD.top + chartH * (1 - t);
            return (
              <g key={t}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="monospace">
                  {Math.round(minW + range * t)}
                </text>
              </g>
            );
          })}
          <polyline points={points} fill="none" stroke="rgba(107,227,164,0.65)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {history.map((d, i) => (
            <g key={d.date}>
              <circle cx={xScale(i)} cy={yScale(d.maxWeight)} r={4} fill="#6BE3A4" stroke="#050506" strokeWidth={1.5} />
              <text x={xScale(i)} y={H - 6} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)" fontFamily="monospace">
                {d.date.slice(5)}
              </text>
            </g>
          ))}
        </svg>
        {isPlateauing && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(242,192,99,0.07)', border: '1px solid rgba(242,192,99,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#F2C063' }}>Plateau — no weight increase in last 4 sessions</span>
              {!plateauTip && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
                  onClick={getPlateauTip}
                  disabled={plateauLoading}
                >
                  {plateauLoading ? '…' : 'Get tip'}
                </button>
              )}
            </div>
            {plateauTip && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{plateauTip}</div>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Progress</div>
      <div style={{ marginBottom: 14 }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{
            padding: '10px 32px 10px 14px', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2376746E' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
            appearance: 'none', color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none', cursor: 'pointer',
            maxWidth: 280,
          }}
        >
          <option value="">Select exercise…</option>
          {exercises.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      {renderChart()}
    </div>
  );
}
