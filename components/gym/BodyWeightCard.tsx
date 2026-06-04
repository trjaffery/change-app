'use client';
import { useCallback, useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { getActiveDateString } from '@/lib/dates';

interface Entry { date: string; weight: number }

const WINDOW_DAYS = 90;

export default function BodyWeightCard() {
  const today = getActiveDateString();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/body-weight?days=${WINDOW_DAYS}`);
      const data = (await res.json()) as Entry[];
      setEntries(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const w = Number(input);
    if (!Number.isFinite(w) || w <= 0) return;
    setSaving(true);
    try {
      await fetch('/api/body-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, weight: w }),
      });
      setInput('');
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 22, minHeight: 140 }}>
        <div className="section-title">Body weight</div>
        <div style={{ height: 60, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} />
      </div>
    );
  }

  const todayEntry = entries.find(e => e.date === today);
  const lastEntry = entries.length ? entries[entries.length - 1] : null;
  const prev = entries.length >= 2 ? entries[entries.length - 2] : null;
  const delta = todayEntry && prev ? todayEntry.weight - prev.weight : null;

  // Consecutive-day streak ending today (or yesterday if today not logged).
  let streak = 0;
  const dates = new Set(entries.map(e => e.date));
  const cursor = new Date(today + 'T12:00:00');
  while (dates.has(cursor.toISOString().split('T')[0])) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // 7-day rolling average aligned by index over the entries window.
  const avg7: (number | null)[] = entries.map((_, i) => {
    if (i < 6) return null;
    const slice = entries.slice(i - 6, i + 1);
    return slice.reduce((s, e) => s + e.weight, 0) / slice.length;
  });

  const showInput = editing || !todayEntry;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="section-title" style={{ margin: 0 }}>Body weight</div>
        {streak > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Flame size={12} strokeWidth={1.75} />
            {streak} day{streak !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: entries.length >= 2 ? 16 : 0 }}>
        {showInput ? (
          <>
            <input
              type="number"
              step="0.1"
              min={0}
              placeholder={lastEntry ? String(lastEntry.weight) : '180.0'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setInput(''); } }}
              autoFocus
              className="text-input"
              inputMode="decimal"
              style={{ width: 130, fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, padding: '10px 14px', textAlign: 'center' }}
            />
            <button className="btn-primary" style={{ fontSize: 13 }} disabled={saving || !input.trim()} onClick={save}>
              {saving ? 'Saving…' : 'Log'}
            </button>
            {editing && (
              <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => { setEditing(false); setInput(''); }}>
                Cancel
              </button>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>lb today</span>
          </>
        ) : (
          <>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {todayEntry!.weight}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>lb today</span>
            {delta !== null && delta !== 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                color: delta > 0 ? 'var(--warning)' : 'var(--success)',
              }}>
                {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)} vs prior
              </span>
            )}
            <button className="btn-secondary" style={{ fontSize: 12, padding: '7px 12px', minHeight: 32 }} onClick={() => { setEditing(true); setInput(String(todayEntry!.weight)); }}>
              Edit
            </button>
          </>
        )}
      </div>

      {entries.length >= 2 && <WeightChart entries={entries} avg7={avg7} />}
    </div>
  );
}

function WeightChart({ entries, avg7 }: { entries: Entry[]; avg7: (number | null)[] }) {
  const W = 600, H = 130, PX = 12, PT = 10, PB = 22;
  const innerW = W - PX * 2;
  const innerH = H - PT - PB;

  const weights = entries.map(e => e.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const range = hi - lo || 1;

  const x = (i: number) => PX + (i / (entries.length - 1)) * innerW;
  const y = (v: number) => PT + innerH - ((v - lo) / range) * innerH;

  const line = entries.map((e, i) => `${x(i)},${y(e.weight)}`).join(' ');
  const area = `${PX},${PT + innerH} ${line} ${PX + innerW},${PT + innerH}`;
  const avgPts = avg7
    .map((v, i) => v !== null ? `${x(i)},${y(v)}` : null)
    .filter((p): p is string => p !== null)
    .join(' ');

  const last = entries[entries.length - 1];
  const fmtTick = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tickIdx = entries.length <= 4
    ? entries.map((_, i) => i)
    : [0, Math.round((entries.length - 1) / 3), Math.round((2 * (entries.length - 1)) / 3), entries.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="bwg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#78B4FF" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#78B4FF" stopOpacity="0" />
        </linearGradient>
        <filter id="bw-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* horizontal grid */}
      {[0, 0.5, 1].map(t => {
        const yy = PT + innerH * (1 - t);
        return <line key={t} x1={PX} y1={yy} x2={PX + innerW} y2={yy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />;
      })}

      <polygon points={area} fill="url(#bwg)" />

      {/* dashed 7-day moving average */}
      {avgPts && (
        <polyline points={avgPts} fill="none" stroke="rgba(120,180,255,0.45)" strokeWidth={1.2} strokeDasharray="4 3" strokeLinecap="round" />
      )}

      <polyline points={line} fill="none" stroke="#78B4FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" filter="url(#bw-glow)" vectorEffect="non-scaling-stroke" />

      {/* per-day dots (subtle) */}
      {entries.map((e, i) => (
        <circle key={e.date} cx={x(i)} cy={y(e.weight)} r={i === entries.length - 1 ? 4 : 1.8} fill={i === entries.length - 1 ? '#FFFFFF' : '#78B4FF'} stroke={i === entries.length - 1 ? '#78B4FF' : 'transparent'} strokeWidth={i === entries.length - 1 ? 2 : 0} filter={i === entries.length - 1 ? 'url(#bw-glow)' : undefined} />
      ))}

      {/* axis date ticks */}
      {tickIdx.map(i => (
        <text key={i} x={x(i)} y={H - 6} fontSize={9} fontFamily="monospace" fill="rgba(255,255,255,0.3)" textAnchor="middle">
          {fmtTick(entries[i].date)}
        </text>
      ))}

      {/* y-axis range labels */}
      <text x={PX} y={PT + innerH + 14} fontSize={9} fontFamily="monospace" fill="rgba(255,255,255,0.3)">{lo.toFixed(0)}</text>
      <text x={PX + innerW} y={PT + innerH + 14} fontSize={9} fontFamily="monospace" fill="rgba(255,255,255,0.3)" textAnchor="end">{last.weight}</text>
    </svg>
  );
}
