'use client';
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Correlation {
  id: string;
  finding: string;
  action?: string;
  strength: 'strong' | 'moderate' | 'weak';
  samples: { a: number; b: number };
  confidence: 'high' | 'low';
}

const STRENGTH_COLOR: Record<Correlation['strength'], string> = {
  strong: 'var(--success)',
  moderate: '#F2C063',
  weak: 'var(--text-tertiary)',
};

export default function Insights() {
  const [correlations, setCorrelations] = useState<Correlation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showWeak, setShowWeak] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/insights');
        const data = await res.json();
        if (cancelled) return;
        if (data.correlations) setCorrelations(data.correlations);
        else setErrorMsg(data.error ?? 'No insights returned');
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const headline = correlations?.[0] ?? null;
  const middle = (correlations ?? []).filter((c, i) => i > 0 && c.strength !== 'weak');
  const weak = (correlations ?? []).filter((c, i) => i > 0 && c.strength === 'weak');

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .ins-sk { background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%); background-size: 200% 100%; animation: ins-shimmer 1.6s linear infinite; border-radius: 6px; }
        @keyframes ins-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
        .ins-headline {
          padding: 14px 16px;
          border-radius: 12px;
          background: rgba(107,227,164,0.05);
          border: 1px solid rgba(107,227,164,0.18);
          border-left: 3px solid var(--success);
          margin-bottom: 16px;
        }
        .ins-headline-finding {
          font-size: 15px; font-weight: 600;
          color: var(--text-primary); line-height: 1.5;
          margin: 0;
        }
        .ins-headline-action {
          font-size: 13px; color: var(--success);
          line-height: 1.5; margin: 8px 0 0;
        }
        .ins-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; }
        .ins-row .dot { flex-shrink: 0; margin-top: 6px; width: 7px; height: 7px; border-radius: 50%; }
        .ins-row .finding { font-size: 13px; color: var(--text-secondary); line-height: 1.55; margin: 0; }
        .ins-row .action { font-size: 12px; color: var(--text-tertiary); line-height: 1.5; margin: 4px 0 0; font-style: italic; }
        .ins-row.weak .finding { color: var(--text-tertiary); }
        .ins-row.weak .action { opacity: 0.7; }
        .ins-section-label {
          font-family: var(--font-mono); font-size: 9px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-tertiary); margin: 14px 0 6px;
        }
        .ins-weak-toggle {
          margin-top: 10px;
          background: transparent; border: 1px dashed rgba(255,255,255,0.12);
          color: var(--text-tertiary);
          padding: 8px 12px; border-radius: 10px;
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.1em; text-transform: uppercase;
          cursor: pointer; width: 100%;
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          -webkit-tap-highlight-color: transparent;
          transition: color 160ms ease;
        }
        .ins-weak-toggle:hover { color: var(--text-secondary); }
        .ins-weak-toggle .chev { transition: transform 200ms ease; }
        .ins-weak-toggle.open .chev { transform: rotate(180deg); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="section-title" style={{ margin: 0 }}>Patterns</div>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>last 30 days</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span className="ins-sk" style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span className="ins-sk" style={{ display: 'block', width: `${80 - i * 12}%`, height: 12, marginBottom: 6 }} />
                <span className="ins-sk" style={{ display: 'block', width: '40%', height: 8 }} />
              </div>
            </div>
          ))}
        </div>
      ) : errorMsg ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic', wordBreak: 'break-word' }}>Error: {errorMsg}</p>
      ) : !correlations || correlations.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
          Not enough data yet — keep logging and patterns across your habits, gym, and recovery will show up here.
        </p>
      ) : (
        <>
          {headline && (
            <div className="ins-headline">
              <p className="ins-headline-finding">{headline.finding}</p>
              {headline.action && <p className="ins-headline-action">→ {headline.action}</p>}
            </div>
          )}

          {middle.length > 0 && (
            <>
              <div className="ins-section-label">Also showing up</div>
              <div>
                {middle.map(c => (
                  <div key={c.id} className="ins-row">
                    <span className="dot" style={{ background: STRENGTH_COLOR[c.strength] }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="finding">{c.finding}</p>
                      {c.action && <p className="action">→ {c.action}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {weak.length > 0 && (
            <>
              <button className={`ins-weak-toggle${showWeak ? ' open' : ''}`} onClick={() => setShowWeak(v => !v)}>
                {showWeak ? 'Hide' : 'Show'} {weak.length} weaker signal{weak.length === 1 ? '' : 's'}
                <ChevronDown size={11} strokeWidth={2.25} className="chev" />
              </button>
              {showWeak && (
                <div style={{ marginTop: 6 }}>
                  {weak.map(c => (
                    <div key={c.id} className="ins-row weak">
                      <span className="dot" style={{ background: STRENGTH_COLOR[c.strength] }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="finding">{c.finding}</p>
                        {c.action && <p className="action">→ {c.action}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
