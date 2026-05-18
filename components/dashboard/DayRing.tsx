'use client';
import { useEffect, useState } from 'react';

const WAKE_HOUR = 8;
const SLEEP_HOUR = 24;
const CIRC = 2 * Math.PI * 52;

const SUN_STOPS: [number, [number, number, number]][] = [
  [0,   [255,216,158]], [12.5,[255,205,121]], [25,  [255,227,143]],
  [37.5,[255,183,106]], [50,  [255,149, 89]], [62.5,[243,111, 79]],
  [75,  [226, 93,122]], [87.5,[123, 91,176]], [100, [ 47, 58,102]],
];

function lerpColor(pct: number): [number, number, number] {
  if (pct <= 0) return SUN_STOPS[0][1];
  if (pct >= 100) return SUN_STOPS[SUN_STOPS.length - 1][1];
  let lo = SUN_STOPS[0], hi = SUN_STOPS[SUN_STOPS.length - 1];
  for (let i = 0; i < SUN_STOPS.length - 1; i++) {
    if (pct >= SUN_STOPS[i][0] && pct <= SUN_STOPS[i + 1][0]) { lo = SUN_STOPS[i]; hi = SUN_STOPS[i + 1]; break; }
  }
  const t = (pct - lo[0]) / (hi[0] - lo[0]);
  return lo[1].map((c, i) => Math.round(c + t * (hi[1][i] - c))) as [number, number, number];
}

function fmtHM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60), m = Math.round(totalMinutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function computeRing() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const hInt = now.getHours();
  const hr12 = hInt === 0 ? 12 : hInt > 12 ? hInt - 12 : hInt;
  const ampm = hInt < 12 ? 'AM' : 'PM';
  const clock = `${hr12}:${String(now.getMinutes()).padStart(2, '0')} ${ampm}`;

  if (h < WAKE_HOUR) return { pct: null, stroke: '#4D4B47', offset: CIRC, pctLabel: '—', phase: 'SLEEPING', status: '😴 Still sleeping', remain: `${fmtHM((WAKE_HOUR - h) * 60)} until wake-up`, clock };
  if (h >= SLEEP_HOUR) return { pct: 100, stroke: '#E25D7A', offset: 0, pctLabel: '100%', phase: 'PAST BEDTIME', status: '⚠️ Past bedtime', remain: 'Sleep!', clock };

  const percent = (h - WAKE_HOUR) / (SLEEP_HOUR - WAKE_HOUR) * 100;
  const [r, g, b] = lerpColor(percent);
  let phase = 'MORNING', status = '☀️ Morning — fresh start';
  if (percent >= 25 && percent < 50) { phase = 'MIDDAY'; status = '⚡ Midday — keep moving'; }
  else if (percent >= 50 && percent < 75) { phase = 'AFTERNOON'; status = '🔥 Afternoon — push it'; }
  else if (percent >= 75 && percent < 90) { phase = 'EVENING'; status = '⏳ Evening — wrap up'; }
  else if (percent >= 90) { phase = 'BEDTIME'; status = '🌙 Bedtime soon'; }
  return { pct: percent, stroke: `rgb(${r},${g},${b})`, offset: CIRC * (1 - percent / 100), pctLabel: `${Math.round(percent)}%`, phase, status, remain: `${fmtHM((SLEEP_HOUR - h) * 60)} awake time left`, clock };
}

export default function DayRing() {
  const [ring, setRing] = useState<ReturnType<typeof computeRing> | null>(null);
  useEffect(() => {
    setRing(computeRing());
    const id = setInterval(() => setRing(computeRing()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!ring) return <div className="card" style={{ marginBottom: 22, minHeight: 168 }} />;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, flexWrap: 'wrap' }}>
        <div style={{ width: 168, height: 168, position: 'relative', flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" fill="none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
            <circle cx="60" cy="60" r="52" fill="none"
              stroke={ring.stroke} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={ring.offset}
              transform="rotate(-90 60 60)" filter="url(#ring-glow)"
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.7s cubic-bezier(0.22,1,0.36,1)' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{ring.pctLabel}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginTop: 5 }}>{ring.phase}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 3 }}>{ring.clock}</div>
          </div>
        </div>
        <div style={{ maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{ring.status}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{ring.remain}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>8:00 AM – 12:00 AM</div>
        </div>
      </div>
    </div>
  );
}
