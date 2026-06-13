'use client';
import { useEffect, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

interface BriefingPayload { line?: string; skip?: boolean; error?: string }

/**
 * One-line setup for today. Renders nothing when the server has no specific
 * signal worth voicing — silence beats generic motivation.
 */
export default function DailyBriefing() {
  const [line, setLine] = useState<string | null>(null);
  const [skip, setSkip] = useState(false);
  const [loading, setLoading] = useState(true);
  const today = getActiveDateString();
  const cacheKey = `briefing_${today}`;

  useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached === '__skip__') { setSkip(true); setLoading(false); return; }
    if (cached) { setLine(cached); setLoading(false); return; }

    let cancelled = false;
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const res = await fetch('/api/ai/briefing', { method: 'POST', signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json() as BriefingPayload;
        if (cancelled) return;
        if (data.skip) {
          localStorage.setItem(cacheKey, '__skip__');
          setSkip(true);
        } else if (data.line) {
          localStorage.setItem(cacheKey, data.line);
          setLine(data.line);
        } else {
          setSkip(true);
        }
      } catch {
        if (!cancelled) setSkip(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cacheKey]);

  if (skip && !loading) return null;

  return (
    <>
      <style>{`
        .briefing-line {
          padding: 12px 14px; margin-bottom: 20px;
          border-radius: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          border-left: 2px solid var(--success);
          font-size: 14px; line-height: 1.5;
          color: var(--text-secondary);
        }
        .briefing-skel { height: 14px; border-radius: 6px; background: rgba(255,255,255,0.07); animation: bf-pulse 1.4s ease-in-out infinite; }
        @keyframes bf-pulse { 0%,100% { opacity: 0.45 } 50% { opacity: 0.85 } }
      `}</style>
      <div className="briefing-line">
        {loading ? <div className="briefing-skel" style={{ width: '70%' }} /> : line}
      </div>
    </>
  );
}
