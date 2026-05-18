'use client';
import { useState } from 'react';

interface ReviewData { summary: string; wins: string[]; improvements: string[]; plan: string[] }

export default function WeeklyReview() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    const res = await fetch('/api/ai/weekly-review', { method: 'POST' });
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data ? 16 : 0 }}>
        <div className="section-title" style={{ margin: 0 }}>Weekly Review</div>
        <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={generate} disabled={loading}>
          {loading ? 'Generating…' : data ? '↺ Regenerate' : 'Generate review'}
        </button>
      </div>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>{data.summary}</p>

          {[
            { label: '✓ Wins', items: data.wins, color: 'var(--success)', bg: 'rgba(107,227,164,0.06)', border: 'rgba(107,227,164,0.15)' },
            { label: '↑ To Improve', items: data.improvements, color: '#F2C063', bg: 'rgba(242,192,99,0.06)', border: 'rgba(242,192,99,0.15)' },
            { label: '→ Plan for Next Week', items: data.plan, color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)' },
          ].map(section => (
            <div key={section.label} style={{ padding: '12px 14px', borderRadius: 12, background: section.bg, border: `1px solid ${section.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: section.color, marginBottom: 10 }}>{section.label}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {section.items.map((item, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                    <span style={{ color: section.color, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>–</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
