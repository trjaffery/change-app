'use client';
import { useEffect, useRef, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

interface Props { done: number; total: number }
interface BriefingPayload { line?: string; skip?: boolean; error?: string }

// The active window used to compute pace: 6 AM → midnight the next 6 AM.
// Anchors to the same "active date" boundary used across the app.
function activeWindow(now: Date): { start: Date; end: Date; pct: number } {
  const start = new Date(now);
  if (start.getHours() < 6) start.setDate(start.getDate() - 1);
  start.setHours(6, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const pct = Math.max(0, Math.min(1, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
  return { start, end, pct };
}

function fmtRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Habit summary card. Replaced the animated ring in the 2026-07 overhaul.
 *
 * The old ring showed done/total as a filled arc — useless when the user's
 * habits skew end-of-day (salah, water), because the arc stayed empty until
 * night. This surface shows the same numbers but frames them against the
 * day's pace, so "on track" / "behind" is legible any time.
 *
 * If a briefing line is available for today, it renders below as a quiet
 * mono-cased quote so the AI daily setup still has a home.
 */
export default function CompletionRing({ done, total }: Props) {
  const pct = total > 0 ? done / total : 0;
  const allDone = total > 0 && done === total;
  const [celebrating, setCelebrating] = useState(false);
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      const key = `habits_celebrated_${getActiveDateString()}`;
      if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        setCelebrating(true);
        const t = setTimeout(() => setCelebrating(false), 3400);
        return () => clearTimeout(t);
      }
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const [briefing, setBriefing] = useState<string | null>(null);
  useEffect(() => {
    const cacheKey = `briefing_v2_${getActiveDateString()}`;
    const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    if (cached === '__skip__') return;
    if (cached) { setBriefing(cached); return; }
    let cancelled = false;
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const res = await fetch('/api/ai/briefing', { method: 'POST', signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json() as BriefingPayload;
        if (cancelled) return;
        if (data.skip || !data.line) {
          localStorage.setItem(cacheKey, '__skip__');
        } else {
          localStorage.setItem(cacheKey, data.line);
          setBriefing(data.line);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Pace comparison: expected done at this point in the day = day% × total.
  // Delta = done - expected. Positive = ahead. Negative = behind.
  let pacePhrase = 'no habits set';
  let paceTone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
  let dayPct = 0;
  let remainingTxt = '';
  if (now) {
    const win = activeWindow(now);
    dayPct = win.pct;
    remainingTxt = fmtRemaining(win.end.getTime() - now.getTime());
    if (total > 0) {
      const expected = dayPct * total;
      const delta = done - expected;
      if (allDone) {
        pacePhrase = 'all done';
        paceTone = 'success';
      } else if (delta >= 0.5) {
        pacePhrase = 'ahead';
        paceTone = 'success';
      } else if (delta > -1) {
        pacePhrase = 'on track';
        paceTone = 'success';
      } else if (delta > -2) {
        pacePhrase = 'a bit behind';
        paceTone = 'warning';
      } else {
        pacePhrase = 'behind';
        paceTone = 'danger';
      }
    }
  }

  const toneColor =
    paceTone === 'success' ? 'var(--success)'
    : paceTone === 'warning' ? 'var(--warning)'
    : paceTone === 'danger' ? 'var(--danger)'
    : 'var(--text-tertiary)';

  return (
    <div className="card card-raised card-accent-home" style={{ marginBottom: 22 }}>
      <style>{`
        .cr-grid {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 22px 24px;
          align-items: center;
        }
        .cr-number {
          font-family: var(--font-mono);
          font-size: 52px;
          font-weight: 600;
          letter-spacing: -0.04em;
          line-height: 1;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .cr-number .cr-slash {
          color: var(--text-tertiary);
          margin: 0 4px;
          font-weight: 400;
        }
        .cr-number .cr-total {
          color: var(--text-tertiary);
          font-weight: 400;
        }
        .cr-label {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-tertiary);
          margin-top: 8px;
        }
        .cr-right { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        .cr-pace {
          display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
        }
        .cr-pace-word {
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.015em;
          color: var(--tone);
        }
        .cr-pace-time {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-tertiary);
          letter-spacing: 0.04em;
        }
        .cr-bar {
          position: relative;
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          overflow: hidden;
        }
        .cr-bar-fill {
          height: 100%;
          background: var(--tone);
          border-radius: inherit;
          transition: width 500ms cubic-bezier(0.22,1,0.36,1);
        }
        .cr-bar-marker {
          position: absolute; top: -3px; bottom: -3px;
          width: 2px;
          background: rgba(255,255,255,0.45);
          border-radius: 1px;
          transition: left 500ms cubic-bezier(0.22,1,0.36,1);
        }
        .cr-legend {
          display: flex; align-items: center; gap: 12px;
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary); letter-spacing: 0.04em;
        }
        .cr-legend-dot {
          display: inline-block; width: 7px; height: 7px; border-radius: 50%;
          margin-right: 5px; vertical-align: middle;
        }
        .cr-briefing {
          margin-top: 20px; padding-top: 16px;
          border-top: 1px solid var(--border-subtle);
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .cr-celebrate {
          margin-top: 12px;
          font-size: 12px;
          color: var(--success);
          animation: cr-fade 3s ease-in-out forwards;
        }
        @keyframes cr-fade {
          0%   { opacity: 0; transform: translateY(2px); }
          15%  { opacity: 1; transform: translateY(0); }
          85%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (max-width: 480px) {
          .cr-grid { grid-template-columns: 1fr; gap: 18px; }
          .cr-number { font-size: 44px; }
        }
      `}</style>

      <div className="cr-grid" style={{ ['--tone' as string]: toneColor }}>
        <div>
          <div className="cr-number">
            {done}
            <span className="cr-slash">/</span>
            <span className="cr-total">{total || 0}</span>
          </div>
          <div className="cr-label">Habits today</div>
        </div>

        <div className="cr-right">
          <div className="cr-pace">
            <span className="cr-pace-word">
              {total === 0 ? 'Add habits to track' : pacePhrase}
            </span>
            {now && total > 0 && (
              <span className="cr-pace-time">{remainingTxt} left</span>
            )}
          </div>

          {total > 0 && (
            <div className="cr-bar">
              <div className="cr-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
              {!allDone && (
                <div
                  className="cr-bar-marker"
                  style={{ left: `${Math.max(0, Math.min(100, Math.round(dayPct * 100)))}%` }}
                  aria-label="day progress"
                  title="Where you'd be if habits were evenly paced"
                />
              )}
            </div>
          )}

          {total > 0 && (
            <div className="cr-legend">
              <span><span className="cr-legend-dot" style={{ background: toneColor }} />{Math.round(pct * 100)}% done</span>
              <span><span className="cr-legend-dot" style={{ background: 'rgba(255,255,255,0.45)' }} />{Math.round(dayPct * 100)}% of day</span>
            </div>
          )}
        </div>
      </div>

      {celebrating && (
        <div className="cr-celebrate">All done today. Alhamdulillah.</div>
      )}

      {briefing && (
        <div className="cr-briefing">{briefing}</div>
      )}
    </div>
  );
}
