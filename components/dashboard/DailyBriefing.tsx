'use client';
import { useEffect, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

export default function DailyBriefing() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const today = getActiveDateString();
  const cacheKey = `briefing_${today}`;

  async function generate(bypassCache = false) {
    setLoading(true);
    setError(false);
    if (!bypassCache) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setBriefing(cached); setLoading(false); return; }
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch('/api/ai/briefing', { method: 'POST', signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.briefing) {
        localStorage.setItem(cacheKey, data.briefing);
        setBriefing(data.briefing);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }

  useEffect(() => { generate(); }, []);

  return (
    <>
      <style>{`
        .briefing-card {
          background: linear-gradient(135deg, rgba(107,227,164,0.06), rgba(255,255,255,0.03));
          border: 1px solid rgba(107,227,164,0.15);
          border-radius: 16px; padding: 18px 20px; margin-bottom: 20px;
          position: relative;
        }
        .briefing-skeleton { height: 14px; border-radius: 6px; background: rgba(255,255,255,0.07); margin-bottom: 8px; animation: shimmer 1.4s ease-in-out infinite; }
        @keyframes shimmer { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
        .briefing-refresh { position: absolute; top: 14px; right: 14px; background: none; border: none; color: var(--text-tertiary); font-size: 11px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: color 0.15s, background 0.15s; font-family: var(--font-mono); }
        .briefing-refresh:hover { color: var(--text-secondary); background: rgba(255,255,255,0.06); }
        .briefing-refresh:disabled { opacity: 0.4; cursor: default; }
      `}</style>
      <div className="briefing-card">
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--success)', marginBottom: 10, opacity: 0.8 }}>
          Today's Briefing
        </div>
        {loading ? (
          <>
            <div className="briefing-skeleton" style={{ width: '95%' }} />
            <div className="briefing-skeleton" style={{ width: '85%' }} />
            <div className="briefing-skeleton" style={{ width: '70%' }} />
          </>
        ) : error ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic' }}>Couldn't generate briefing — tap Refresh to try again.</p>
        ) : (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>{briefing}</p>
        )}
        <button className="briefing-refresh" disabled={loading} onClick={() => generate(true)}>
          {loading ? '…' : '↺ Refresh'}
        </button>
      </div>
    </>
  );
}
