'use client';
import { useCallback, useEffect, useState } from 'react';
import { Activity, Moon, RefreshCw } from 'lucide-react';
import { getActiveDateString } from '@/lib/dates';

interface Row { date: string; steps: number | null; sleep_minutes: number | null }

const WINDOW_DAYS = 7;
// Name of the iOS Shortcut to run when the Sync button is tapped. Must match
// what the user named it on their device — iOS looks shortcuts up by name.
const SYNC_SHORTCUT_NAME = 'Steps to Change';

export default function HealthMetricsCard() {
  const today = getActiveDateString();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/health-import?days=${WINDOW_DAYS}`);
      const data = (await res.json()) as Row[];
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Re-fetch when the tab regains focus — covers the "tap Sync, iOS opens
  // Shortcuts, Shortcut posts to webhook, user swipes back to the PWA" flow.
  useEffect(() => {
    function onVis() { if (document.visibilityState === 'visible') load(); }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const syncHref = `shortcuts://run-shortcut?name=${encodeURIComponent(SYNC_SHORTCUT_NAME)}`;

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 22, minHeight: 140 }}>
        <div className="section-title">Health</div>
        <div style={{ height: 60, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 22 }}>
        <CardHeader syncHref={syncHref} />
        <div className="empty-state" style={{ textAlign: 'left', fontSize: 12 }}>
          No data yet. Set up the iOS Shortcut in Settings → Health import to start syncing steps and sleep from your iPhone.
        </div>
      </div>
    );
  }

  const stepSeries = rows.map(r => r.steps);
  const sleepSeries = rows.map(r => r.sleep_minutes);

  const todayRow = rows.find(r => r.date === today);
  const stepsToday = todayRow?.steps ?? null;
  const stepsAvg = avg(stepSeries);

  // Sleep is attributed to the wake day, so "last sleep" means the most recent
  // non-null sleep_minutes — almost always yesterday or today.
  const lastSleep = lastDefined(sleepSeries);
  const sleepAvg = avg(sleepSeries);

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <CardHeader syncHref={syncHref} />

      <MetricRow
        icon={<Activity size={14} strokeWidth={1.75} />}
        label="Steps today"
        primary={stepsToday !== null ? stepsToday.toLocaleString() : '—'}
        secondary={stepsAvg !== null ? `${WINDOW_DAYS}d avg ${Math.round(stepsAvg).toLocaleString()}` : null}
        series={stepSeries}
        color="#6BE3A4"
      />

      <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '14px 0' }} />

      <MetricRow
        icon={<Moon size={14} strokeWidth={1.75} />}
        label="Last sleep"
        primary={lastSleep !== null ? formatSleep(lastSleep) : '—'}
        secondary={sleepAvg !== null ? `${WINDOW_DAYS}d avg ${formatSleep(Math.round(sleepAvg))}` : null}
        series={sleepSeries}
        color="#9F84FF"
      />
    </div>
  );
}

function CardHeader({ syncHref }: { syncHref: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div className="section-title" style={{ margin: 0 }}>Health</div>
      <a
        href={syncHref}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8,
          background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-secondary)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
          WebkitTapHighlightColor: 'transparent',
        }}
        aria-label="Sync from Health"
      >
        <RefreshCw size={11} strokeWidth={1.75} /> Sync
      </a>
    </div>
  );
}

function MetricRow({
  icon, label, primary, secondary, series, color,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string | null;
  series: (number | null)[];
  color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
          {icon} {label}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1 }}>
          {primary}
        </div>
        {secondary && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {secondary}
          </div>
        )}
      </div>
      <Sparkline series={series} color={color} />
    </div>
  );
}

function Sparkline({ series, color }: { series: (number | null)[]; color: string }) {
  // Compact 7-day sparkline. Nulls render as gaps so missing days don't lie
  // about the trend. Last data point gets a glowing dot for "you are here".
  const W = 130, H = 44, PX = 4, PT = 6, PB = 6;
  const innerW = W - PX * 2;
  const innerH = H - PT - PB;

  const numeric = series.map(v => (typeof v === 'number' ? v : null));
  const defined = numeric.filter((v): v is number => v !== null);
  if (defined.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, flexShrink: 0 }}>
        <line x1={PX} y1={H / 2} x2={W - PX} y2={H / 2} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      </svg>
    );
  }
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const pad = (max - min) * 0.12 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const range = hi - lo || 1;
  const n = numeric.length;

  const x = (i: number) => PX + (i / (n - 1)) * innerW;
  const y = (v: number) => PT + innerH - ((v - lo) / range) * innerH;

  // Build polyline segments split on nulls so gaps don't connect linearly.
  const segments: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = numeric[i];
    if (v === null) {
      if (current.length > 1) segments.push(current);
      current = [];
    } else {
      current.push(`${x(i)},${y(v)}`);
    }
  }
  if (current.length > 1) segments.push(current);

  // Last non-null index for the "you are here" dot.
  let lastIdx = -1;
  for (let i = n - 1; i >= 0; i--) if (numeric[i] !== null) { lastIdx = i; break; }

  const gradientId = `hs-${color.replace('#', '')}`;
  const glowId = `hs-glow-${color.replace('#', '')}`;
  const lastFilled = segments.length ? segments[segments.length - 1] : null;
  const areaPoints = lastFilled
    ? `${lastFilled[0].split(',')[0]},${PT + innerH} ${lastFilled.join(' ')} ${lastFilled[lastFilled.length - 1].split(',')[0]},${PT + innerH}`
    : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {areaPoints && <polygon points={areaPoints} fill={`url(#${gradientId})`} />}
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {lastIdx >= 0 && numeric[lastIdx] !== null && (
        <circle
          cx={x(lastIdx)}
          cy={y(numeric[lastIdx]!)}
          r={2.8}
          fill="#FFFFFF"
          stroke={color}
          strokeWidth={1.6}
          filter={`url(#${glowId})`}
        />
      )}
    </svg>
  );
}

function avg(series: (number | null)[]): number | null {
  const defined = series.filter((v): v is number => v !== null);
  if (defined.length === 0) return null;
  return defined.reduce((s, v) => s + v, 0) / defined.length;
}

function lastDefined(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (typeof series[i] === 'number') return series[i] as number;
  }
  return null;
}

function formatSleep(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
