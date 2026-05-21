'use client';
import { useEffect, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

export default function DailyBriefing() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const today = getActiveDateString();
  const cacheKey = `briefing_${today}`;

  async function generate() {
    setLoading(true);
    setErrorMsg(null);
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setBriefing(cached); setLoading(false); return; }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch('/api/ai/briefing', { method: 'POST', signal: controller.signal });
      clearTimeout(timeout);
      const text = await res.text();
      let data: Record<string, string> = {};
      try { data = JSON.parse(text); } catch { setErrorMsg(`Bad response (${res.status}): ${text.slice(0, 120)}`); setLoading(false); return; }
      if (data.briefing) {
        localStorage.setItem(cacheKey, data.briefing);
        setBriefing(data.briefing);
      } else {
        setErrorMsg(data.error ?? 'No briefing returned');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  }

  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        .briefing-card {
          background: linear-gradient(135deg, rgba(107,227,164,0.06), rgba(255,255,255,0.03));
          border: 1px solid rgba(107,227,164,0.15);
          border-radius: 16px; padding: 18px 20px; margin-bottom: 20px;
        }
        .briefing-skeleton { height: 14px; border-radius: 6px; background: rgba(255,255,255,0.07); margin-bottom: 8px; animation: shimmer 1.4s ease-in-out infinite; }
        @keyframes shimmer { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
        .briefing-retry { margin-top: 10px; background: none; border: 1px solid rgba(255,255,255,0.1); color: var(--text-tertiary); font-size: 11px; cursor: pointer; padding: 4px 10px; border-radius: 6px; transition: color 0.15s, background 0.15s; font-family: var(--font-mono); }
        .briefing-retry:hover { color: var(--text-secondary); background: rgba(255,255,255,0.06); }
      `}</style>
      <div className="briefing-card">
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--success)', marginBottom: 10, opacity: 0.8 }}>
          Today&apos;s Briefing
        </div>
        {loading ? (
          <>
            <div className="briefing-skeleton" style={{ width: '95%' }} />
            <div className="briefing-skeleton" style={{ width: '85%' }} />
            <div className="briefing-skeleton" style={{ width: '70%' }} />
          </>
        ) : errorMsg ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic', wordBreak: 'break-word' }}>Error: {errorMsg}</p>
            <button className="briefing-retry" onClick={generate}>↺ Retry</button>
          </>
        ) : (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>{briefing}</p>
        )}
      </div>
    </>
  );
}
