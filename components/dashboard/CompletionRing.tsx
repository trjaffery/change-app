'use client';

const CIRC = 2 * Math.PI * 52;

interface Props { done: number; total: number }

export default function CompletionRing({ done, total }: Props) {
  const pct = total > 0 ? done / total : 0;
  const offset = CIRC * (1 - pct);
  const allDone = total > 0 && done === total;
  const stroke = allDone ? '#6BE3A4' : pct > 0 ? '#F2C063' : 'rgba(255,255,255,0.08)';

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, flexWrap: 'wrap' }}>
        <div style={{ width: 160, height: 160, position: 'relative', flexShrink: 0 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {total === 0
              ? 'Add habits to track'
              : allDone
              ? 'All done today.'
              : done === 0
              ? 'Nothing done yet.'
              : `${total - done} left today`}
          </div>
          {total > 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              {Math.round(pct * 100)}% complete
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
