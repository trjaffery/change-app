'use client';
import { useEffect, useState } from 'react';

interface Urge { created_at: string }
interface PatternsData { riskFactors: string[]; timePatterns: string[]; copingStrategies: string[] }
const BUCKETS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;

function getHourBucket(ts: string): typeof BUCKETS[number] {
  const h = new Date(ts).getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

export default function UrgePatterns({ refreshKey }: { refreshKey: number }) {
  const [counts, setCounts] = useState<Record<string, number>>({ Morning: 0, Afternoon: 0, Evening: 0, Night: 0 });
  const [dailyCounts, setDailyCounts] = useState<{ date: string; count: number }[]>([]);
  const [patterns, setPatterns] = useState<PatternsData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetch('/api/recovery/urges').then(r => r.json()).then((urges: Urge[]) => {
      const c = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
      for (const u of urges) c[getHourBucket(u.created_at)]++;
      setCounts(c);

      const last30: { date: string; count: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
        const key = d.toISOString().split('T')[0];
        last30.push({ date: key, count: urges.filter(u => u.created_at.startsWith(key)).length });
      }
      setDailyCounts(last30);
    });
  }, [refreshKey]);

  async function analysePatterns() {
    setAiLoading(true);
    const res = await fetch('/api/ai/recovery-patterns', { method: 'POST' });
    const json = await res.json();
    setPatterns(json);
    setAiLoading(false);
  }

  const maxCount = Math.max(...Object.values(counts), 1);
  const maxDaily = Math.max(...dailyCounts.map(d => d.count), 1);
  const MAX_H = 60;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Urge Patterns</div>

      {/* 30-day trend */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>30-Day Trend</div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 52 }}>
          {dailyCounts.map(d => (
            <div key={d.date} title={`${d.date}: ${d.count}`} style={{
              flex: 1, borderRadius: 2,
              background: d.count > 0 ? 'rgba(242,192,99,0.5)' : 'rgba(255,255,255,0.04)',
              height: d.count > 0 ? Math.max(3, Math.round((d.count / maxDaily) * 40)) : 3,
              alignSelf: 'flex-end',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
            {dailyCounts[0] ? new Date(dailyCounts[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Today</span>
        </div>
      </div>

      {/* Time-of-day chart */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 90 }}>
        {BUCKETS.map(b => (
          <div key={b} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{counts[b]}</div>
            <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'rgba(242,192,99,0.45)', height: Math.max(4, Math.round((counts[b] / maxCount) * MAX_H)), transition: 'height 0.4s cubic-bezier(0.22,1,0.36,1)' }} />
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{b}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: patterns ? 14 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>AI Pattern Analysis</div>
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={analysePatterns} disabled={aiLoading}>
            {aiLoading ? 'Analysing…' : patterns ? '↺ Re-analyse' : 'Analyse patterns'}
          </button>
        </div>

        {patterns && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {patterns.riskFactors.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', marginBottom: 8, letterSpacing: '0.06em' }}>Risk Factors</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {patterns.riskFactors.map((f, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f}</span>
                  ))}
                </div>
              </div>
            )}
            {patterns.timePatterns.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#F2C063', marginBottom: 8, letterSpacing: '0.06em' }}>Time Patterns</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {patterns.timePatterns.map((p, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                      <span style={{ color: '#F2C063', flexShrink: 0 }}>–</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {patterns.copingStrategies.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 8, letterSpacing: '0.06em' }}>Coping Strategies</div>
                <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {patterns.copingStrategies.map((s, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, display: 'flex', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)', flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>{s}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
