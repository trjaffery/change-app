'use client';
import { useEffect, useRef, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

const CIRC = 2 * Math.PI * 52;

interface Props { done: number; total: number }

// Day phases keyed to the app's 6 AM day boundary.
// Each entry: [startHour, label, color]
type Phase = { label: string; start: number; end: number; color: string };
const PHASES: Phase[] = [
  { label: 'MORNING',   start: 6,  end: 12, color: '#F2C063' },
  { label: 'MIDDAY',    start: 12, end: 17, color: '#6BE3A4' },
  { label: 'AFTERNOON', start: 17, end: 21, color: '#78B4FF' },
  // Wraps midnight — handled below as "hour >= 21 OR hour < 6".
  { label: 'EVENING',   start: 21, end: 30, color: '#B07FE8' },
];

function currentPhase(d: Date): Phase {
  const h = d.getHours();
  const normalized = h < 6 ? h + 24 : h; // map 0–5 onto 24–29 so EVENING (21→30) wraps cleanly
  return PHASES.find(p => normalized >= p.start && normalized < p.end) ?? PHASES[0];
}

function fmtRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function CompletionRing({ done, total }: Props) {
  const pct = total > 0 ? done / total : 0;
  const offset = CIRC * (1 - pct);
  const allDone = total > 0 && done === total;
  const stroke = allDone ? '#6BE3A4' : pct > 0 ? '#F2C063' : 'rgba(255,255,255,0.08)';

  // Phase 2 #6: celebration moment when the user crosses 100% for the first time
  // today. Once per active day (6 AM boundary), keyed in localStorage.
  const [celebrating, setCelebrating] = useState(false);
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      const key = `habits_celebrated_${getActiveDateString()}`;
      if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        setCelebrating(true);
        const t = setTimeout(() => setCelebrating(false), 4200);
        return () => clearTimeout(t);
      }
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  // Live clock — tick every 30s. No need to be more precise than that for a phase chip.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // Phase chip + remaining (only render after hydration so SSR/CSR match).
  let phaseLabel = '', phaseColor = '#888', clockTxt = '', remainingTxt = '';
  if (now) {
    const p = currentPhase(now);
    phaseLabel = p.label;
    phaseColor = p.color;
    clockTxt = fmtClock(now);
    const endHour = p.end > 24 ? p.end - 24 : p.end;
    const endDate = new Date(now);
    if (p.end > 24 && now.getHours() < 6) {
      // Already past midnight inside EVENING — end is today at 6 AM
      endDate.setHours(6, 0, 0, 0);
    } else if (p.end > 24) {
      // Late evening before midnight — end is tomorrow at 6 AM
      endDate.setDate(endDate.getDate() + 1);
      endDate.setHours(6, 0, 0, 0);
    } else {
      endDate.setHours(endHour, 0, 0, 0);
    }
    remainingTxt = fmtRemaining(endDate.getTime() - now.getTime()) + ' left';
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        @keyframes ring-pulse {
          0%, 100% { transform: scale(1); }
          22%      { transform: scale(1.06); }
          55%      { transform: scale(0.98); }
        }
        @keyframes ring-glow {
          0%, 100% { filter: drop-shadow(0 0 0 rgba(107,227,164,0)); }
          50%      { filter: drop-shadow(0 0 24px rgba(107,227,164,0.55)); }
        }
        .ring-celebrate { animation: ring-pulse 1.6s ease-in-out 2, ring-glow 1.6s ease-in-out 2; }
        @keyframes cel-fade { 0% { opacity: 0; transform: translateY(4px); } 18% { opacity: 1; transform: translateY(0); } 82% { opacity: 1; } 100% { opacity: 0; transform: translateY(-2px); } }
        .ring-cel-line { animation: cel-fade 4s ease-in-out forwards; color: var(--success); font-family: var(--font-serif); font-style: italic; font-size: 13px; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, flexWrap: 'wrap' }}>
        <div className={celebrating ? 'ring-celebrate' : ''} style={{ width: 160, height: 160, position: 'relative', flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" fill="none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
            <circle cx="60" cy="60" r="52" fill="none"
              stroke={stroke} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              filter={pct > 0 ? 'url(#ring-glow)' : undefined}
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1), stroke 0.4s' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{done}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginTop: 4 }}>of {total}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
          {now && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', padding: '3px 8px', borderRadius: 5, color: phaseColor, background: `${phaseColor}1A`, border: `1px solid ${phaseColor}44` }}>
                {phaseLabel}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>{clockTxt}</span>
            </div>
          )}
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {total === 0
              ? 'Add habits to track'
              : allDone
              ? 'All done today.'
              : done === 0
              ? 'Nothing done yet.'
              : `${total - done} left today`}
          </div>
          {celebrating && (
            <div className="ring-cel-line">Alhamdulillah — every one of them, today.</div>
          )}
          {total > 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              {Math.round(pct * 100)}% complete
            </div>
          )}
          {now && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
              {remainingTxt} in {phaseLabel.toLowerCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
