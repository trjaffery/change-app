'use client';
import { useEffect, useState } from 'react';

interface Correlation {
  id: string;
  finding: string;
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

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="section-title" style={{ margin: 0 }}>Patterns</div>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>last 30 days</span>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic' }}>Looking for patterns…</p>
      ) : errorMsg ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic', wordBreak: 'break-word' }}>Error: {errorMsg}</p>
      ) : !correlations || correlations.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
          Not enough data yet — keep logging and patterns across your habits, gym, and recovery will show up here.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {correlations.map(c => (
            <li key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, marginTop: 4, width: 8, height: 8, borderRadius: '50%',
                background: STRENGTH_COLOR[c.strength],
              }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>{c.finding}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: STRENGTH_COLOR[c.strength], fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {c.strength}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {c.samples.a} vs {c.samples.b} days
                  </span>
                  {c.confidence === 'low' && (
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontStyle: 'italic' }}>
                      rough estimate
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
