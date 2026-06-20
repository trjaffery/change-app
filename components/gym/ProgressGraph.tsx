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
      .then(data => { setHistory(data); })
      .catch(() => { setHistory([]); })
      .finally(() => setLoading(false));
  }, [selected]);

  // Phase 4 #15: detect a stalled exercise (same max weight for 3+ consecutive
  // sessions) and auto-fetch the plateau tip without requiring a button tap.
  // Cached in sessionStorage by (exercise|weight|count) so the call doesn't
  // re-fire on every render while the user is browsing the page.
  useEffect(() => {
    if (!selected || history.length < 3 || plateauTip || plateauLoading) return;
    const tail = history.slice(-3);
    const weights = tail.map(s => s.maxWeight);
    const stalled = weights.every(w => w === weights[0]);
    if (!stalled) return;
    const key = `plateau:${selected}:${weights[0]}:${tail.length}`;
    if (typeof window !== 'undefined') {
      const cached = window.sessionStorage.getItem(key);
      if (cached) { setPlateauTip(cached); return; }
    }
    (async () => {
      setPlateauLoading(true);
      try {
        const storedRest = typeof window !== 'undefined' ? localStorage.getItem('gymRestDuration') : null;
        const restSeconds = storedRest ? Number(storedRest) : 90;
        const res = await fetch('/api/ai/plateau', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exercise: selected,
            sessions: history.slice(-4).map(h => ({ date: h.date, maxWeight: h.maxWeight })),
            restSeconds,
          }),
        });
        const data = await res.json() as { suggestion?: string };
        if (data.suggestion) {
          setPlateauTip(data.suggestion);
          if (typeof window !== 'undefined') window.sessionStorage.setItem(key, data.suggestion);
        }
      } catch { /* silent — the "Get tip" button is still available */ }
      finally { setPlateauLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, history]);

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

  // Classify the last-4-session trend: percent change from session[0] to session[3].
  // > +2.5%  → upgrade (add weight)
  //  ±2.5%  → hold (plateau — same load, push reps)
  // < −2.5% → deload (drop weight)
  const trend: { kind: 'upgrade' | 'hold' | 'deload'; pct: number } | null = history.length >= 4 ? (() => {
    const last = history.slice(-4);
    const start = last[0].maxWeight;
    const end = last[last.length - 1].maxWeight;
    const pct = ((end - start) / start) * 100;
    if (pct > 2.5) return { kind: 'upgrade' as const, pct };
    if (pct < -2.5) return { kind: 'deload' as const, pct };
    return { kind: 'hold' as const, pct };
  })() : null;
  const TREND_META = {
    upgrade: { color: '#6BE3A4', bg: 'rgba(107,227,164,0.07)', border: 'rgba(107,227,164,0.22)', label: 'Upgrade — add weight next session' },
    hold:    { color: '#F2C063', bg: 'rgba(242,192,99,0.07)',  border: 'rgba(242,192,99,0.2)',  label: 'Hold — same load, push reps' },
    deload:  { color: '#FF6B6B', bg: 'rgba(255,107,107,0.07)', border: 'rgba(255,107,107,0.22)', label: 'Deload — drop weight 10%' },
  };

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
    const mean = weights.reduce((s, w) => s + w, 0) / weights.length;
    const xScale = (i: number) => PAD.left + (i / (history.length - 1)) * chartW;
    const yScale = (w: number) => PAD.top + chartH - ((w - minW) / range) * chartH;
    const points = history.map((d, i) => `${xScale(i)},${yScale(d.maxWeight)}`).join(' ');
    // Closed area path: line + drop to baseline at both ends for the gradient fill.
    const area = `${PAD.left},${PAD.top + chartH} ${points} ${PAD.left + chartW},${PAD.top + chartH}`;
    const meanY = yScale(mean);
    const lastIdx = history.length - 1;
    // Sparse x-axis ticks (first, ~1/3, ~2/3, last) to avoid date label clutter
    const tickIdx = history.length <= 4
      ? history.map((_, i) => i)
      : [0, Math.round(lastIdx / 3), Math.round((2 * lastIdx) / 3), lastIdx];

    return (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="pg-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6BE3A4" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#6BE3A4" stopOpacity="0" />
            </linearGradient>
            <filter id="pg-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* horizontal grid */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = PAD.top + chartH * (1 - t);
            return (
              <g key={t}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="monospace">
                  {Math.round(minW + range * t)}
                </text>
              </g>
            );
          })}

          {/* area fill */}
          <polygon points={area} fill="url(#pg-fill)" />

          {/* dashed mean line — only show if we have enough variance to make it useful */}
          {range > maxW * 0.02 && (
            <g>
              <line x1={PAD.left} y1={meanY} x2={W - PAD.right} y2={meanY} stroke="rgba(107,227,164,0.4)" strokeWidth={1.2} strokeDasharray="4 3" />
              <text x={W - PAD.right - 4} y={meanY - 4} textAnchor="end" fontSize={8} fill="rgba(107,227,164,0.55)" fontFamily="monospace">
                avg {Math.round(mean)}
              </text>
            </g>
          )}

          {/* line with glow */}
          <polyline points={points} fill="none" stroke="#6BE3A4" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" filter="url(#pg-glow)" vectorEffect="non-scaling-stroke" />

          {/* small dots per session, except the last which gets a "today" highlight */}
          {history.map((d, i) => {
            const isLast = i === lastIdx;
            return (
              <circle
                key={d.date}
                cx={xScale(i)} cy={yScale(d.maxWeight)}
                r={isLast ? 4.5 : 2.5}
                fill={isLast ? '#FFFFFF' : '#6BE3A4'}
                stroke={isLast ? '#6BE3A4' : 'transparent'}
                strokeWidth={isLast ? 2 : 0}
                filter={isLast ? 'url(#pg-glow)' : undefined}
              />
            );
          })}

          {/* sparse x-axis date labels */}
          {tickIdx.map(i => (
            <text key={i} x={xScale(i)} y={H - 6} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)" fontFamily="monospace">
              {history[i].date.slice(5)}
            </text>
          ))}
        </svg>
        {trend && (() => {
          const meta = TREND_META[trend.kind];
          const sign = trend.pct >= 0 ? '+' : '';
          return (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: meta.bg, border: `1px solid ${meta.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: meta.color }}>
                  {meta.label}
                  <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', opacity: 0.75, fontSize: 11 }}>{sign}{trend.pct.toFixed(1)}% over last 4</span>
                </span>
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
          );
        })()}
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
