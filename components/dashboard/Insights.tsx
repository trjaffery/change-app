'use client';
import { useEffect, useState } from 'react';

interface Correlation {
  id: string;
  finding: string;
  action?: string;
  strength: 'strong' | 'moderate' | 'weak';
  samples: { a: number; b: number };
  confidence: 'high' | 'low';
}

/**
 * Cross-domain pattern feed. Sourced deterministically from
 * lib/correlations.ts — no LLM in the loop, so findings are stable across
 * loads. The 2026-07 overhaul cleaned up the visual language:
 *   • Numbered list per insight, no coloured tint blocks
 *   • Bigger typography, real sentences (findings ARE full sentences today,
 *     the earlier "cryptic" complaint traced to /api/ai/briefing which was
 *     tuned separately)
 */
export default function Insights() {
  const [correlations, setCorrelations] = useState<Correlation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  }, []);

  const strong = (correlations ?? []).filter(c => c.strength === 'strong');

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .in-head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 4px;
        }
        .in-title {
          font-family: var(--font-sans);
          font-size: 15px; font-weight: 600;
          letter-spacing: -0.005em;
          color: var(--text-primary);
        }
        .in-window {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--text-tertiary);
        }
        .in-sub {
          font-size: 13px;
          color: var(--text-tertiary);
          line-height: 1.55;
          margin-top: 6px;
          margin-bottom: 18px;
          max-width: 62ch;
        }

        .in-list { display: flex; flex-direction: column; gap: 6px; }
        .in-item {
          position: relative;
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 12px;
          padding: 14px 4px;
          border-top: 1px solid var(--border-subtle);
        }
        .in-item:first-of-type { border-top: none; padding-top: 4px; }
        .in-num {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--text-tertiary);
          padding-top: 3px;
          text-align: right;
        }
        .in-body { min-width: 0; }
        .in-finding {
          font-size: 15px; line-height: 1.5;
          color: var(--text-primary);
          margin: 0;
          font-weight: 500;
          letter-spacing: -0.005em;
        }
        .in-action {
          font-size: 13px; line-height: 1.55;
          color: var(--text-secondary);
          margin: 8px 0 0;
          display: flex; align-items: baseline; gap: 8px;
        }
        .in-action-arrow {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--success);
          flex-shrink: 0;
        }

        .in-empty {
          font-size: 13px; line-height: 1.6;
          color: var(--text-tertiary);
          padding: 8px 0 4px;
          max-width: 62ch;
        }

        .in-sk {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%);
          background-size: 200% 100%;
          animation: in-shimmer 1.6s linear infinite;
          border-radius: 4px;
          display: block;
        }
        @keyframes in-shimmer {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>

      <div className="in-head">
        <span className="in-title">Patterns</span>
        <span className="in-window">Last 30 days</span>
      </div>

      {loading ? (
        <div className="in-list" style={{ marginTop: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="in-item">
              <span className="in-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <span className="in-sk" style={{ height: 14, width: `${80 - i * 10}%`, marginBottom: 8 }} />
                <span className="in-sk" style={{ height: 12, width: '48%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : errorMsg ? (
        <p className="in-empty">Couldn&apos;t load insights: {errorMsg}</p>
      ) : strong.length === 0 ? (
        <p className="in-empty">
          Nothing strong to surface yet. Cross-domain patterns need at least a few weeks of overlapping habit, workout, and recovery logs before signal separates from noise.
        </p>
      ) : (
        <div className="in-list">
          {strong.map((c, i) => (
            <div key={c.id} className="in-item">
              <span className="in-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="in-body">
                <p className="in-finding">{c.finding}</p>
                {c.action && (
                  <p className="in-action">
                    <span className="in-action-arrow">→</span>
                    <span>{c.action}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
