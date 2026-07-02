'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { getActiveDateString } from '@/lib/dates';

const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4'];

interface Entry { date: string; body: string; mood: number | null; updated_at: string }

/**
 * Home's command bar — replaces the giant CompletionRing card. Sits directly
 * under PageHeader and gives the page its dashboard character:
 *
 *   date · pace metric · mood pills · quick-add task button
 *
 * Self-contained: fetches diary state for mood, receives habit done/total from
 * the page. Dispatches `focus-task-input` when the quick-add button is tapped
 * — DailyTasks listens and focuses its input.
 */
export default function HomeCommandBar({ done, total }: { done: number; total: number }) {
  const today = getActiveDateString();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [savingMood, setSavingMood] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

  const loadDiary = useCallback(async () => {
    try {
      const res = await fetch(`/api/diary/${today}`);
      setEntry((await res.json()) as Entry | null);
    } catch { /* silent */ }
  }, [today]);
  useEffect(() => {
    const id = window.setTimeout(() => void loadDiary(), 0);
    return () => window.clearTimeout(id);
  }, [loadDiary]);

  async function setMood(m: number) {
    if (savingMood !== null) return;
    setSavingMood(m);
    try {
      const nextMood = entry?.mood === m ? null : m;
      const res = await fetch(`/api/diary/${today}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: entry?.body ?? '', mood: nextMood }),
      });
      if (res.ok) setEntry((await res.json()) as Entry);
    } finally {
      setSavingMood(null);
    }
  }

  const currentMood = entry?.mood ?? null;

  // Pace calculation — matches CompletionRing's logic.
  const activeStart = new Date();
  if (activeStart.getHours() < 6) activeStart.setDate(activeStart.getDate() - 1);
  activeStart.setHours(6, 0, 0, 0);
  const activeEnd = new Date(activeStart);
  activeEnd.setDate(activeEnd.getDate() + 1);
  const dayPct = now ? Math.max(0, Math.min(1, (now.getTime() - activeStart.getTime()) / (activeEnd.getTime() - activeStart.getTime()))) : 0;
  const pct = total > 0 ? done / total : 0;
  const allDone = total > 0 && done === total;

  let pacePhrase = '';
  let paceTone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
  if (total === 0) {
    pacePhrase = 'no habits';
  } else if (allDone) {
    pacePhrase = 'all done';
    paceTone = 'success';
  } else if (now) {
    const expected = dayPct * total;
    const delta = done - expected;
    if (delta >= 0.5) { pacePhrase = 'ahead'; paceTone = 'success'; }
    else if (delta > -1) { pacePhrase = 'on track'; paceTone = 'success'; }
    else if (delta > -2) { pacePhrase = 'a bit behind'; paceTone = 'warning'; }
    else { pacePhrase = 'behind'; paceTone = 'danger'; }
  }

  const toneColor =
    paceTone === 'success' ? 'var(--success)'
    : paceTone === 'warning' ? 'var(--warning)'
    : paceTone === 'danger' ? 'var(--danger)'
    : 'var(--text-tertiary)';

  const dateLine = now
    ? now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  function focusTaskInput() {
    window.dispatchEvent(new CustomEvent('focus-task-input'));
  }

  return (
    <div className="hcb">
      <style>{`
        .hcb {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) minmax(220px, 0.82fr) minmax(180px, 1fr);
          align-items: center;
          gap: 24px;
          padding: 16px 0 18px;
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.11);
          margin-bottom: 0;
        }
        .hcb-date {
          display: flex; flex-direction: column; gap: 3px;
          min-width: 0;
        }
        .hcb-eyebrow {
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-tertiary);
        }
        .hcb-day {
          font-family: var(--font-sans);
          font-size: 16px; font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.005em;
        }

        .hcb-pace {
          display: flex; flex-direction: column; gap: 6px;
          align-items: stretch; min-width: 180px;
        }
        .hcb-pace-label {
          font-family: var(--font-mono);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-tertiary);
          text-align: center;
        }
        .hcb-pace-numbers {
          display: flex; align-items: baseline; justify-content: center; gap: 8px;
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
        }
        .hcb-pace-count {
          font-size: 30px; font-weight: 650;
          color: var(--text-primary);
          letter-spacing: 0;
          line-height: 1;
        }
        .hcb-pace-total {
          font-size: 16px;
          color: var(--text-tertiary);
          font-weight: 400;
        }
        .hcb-pace-word {
          font-family: var(--font-sans);
          font-size: 13px; font-weight: 500;
          color: var(--tone);
          letter-spacing: -0.005em;
        }
        .hcb-pace-bar {
          position: relative;
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }
        .hcb-pace-bar-fill {
          height: 100%;
          background: var(--tone);
          border-radius: inherit;
          transition: width 500ms cubic-bezier(0.22,1,0.36,1);
        }
        .hcb-pace-bar-marker {
          position: absolute; top: -2px; bottom: -2px;
          width: 2px;
          background: rgba(255,255,255,0.5);
          border-radius: 1px;
          transition: left 500ms cubic-bezier(0.22,1,0.36,1);
        }

        .hcb-right {
          display: flex; align-items: center; justify-content: flex-end;
          gap: 14px;
          min-width: 0;
        }
        .hcb-mood-row {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 7px;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 999px;
        }
        .hcb-mood-pill {
          width: 22px; height: 22px; border-radius: 50%;
          border: 1.5px solid transparent;
          cursor: pointer; padding: 0;
          background: transparent;
          transition: transform 140ms ease, border-color 160ms ease;
          -webkit-tap-highlight-color: transparent;
          position: relative;
        }
        .hcb-mood-pill::before {
          content: ''; position: absolute; inset: 4px;
          border-radius: 50%; background: var(--mood-tone);
          opacity: 0.4; transition: opacity 160ms ease;
        }
        .hcb-mood-pill.on { border-color: var(--mood-tone); }
        .hcb-mood-pill.on::before { opacity: 1; }
        .hcb-mood-pill:hover::before { opacity: 0.8; }
        .hcb-mood-pill:disabled { opacity: 0.5; cursor: default; }

        .hcb-add {
          display: inline-flex; align-items: center; justify-content: center;
          gap: 6px;
          width: 38px; height: 38px;
          border-radius: 50%;
          border: 1px solid rgba(107,227,164,0.28);
          background: rgba(107,227,164,0.07);
          color: var(--success);
          cursor: pointer;
          transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .hcb-add:hover {
          background: rgba(255,255,255,0.04);
          border-color: var(--border-strong);
          color: var(--text-primary);
        }

        @media (max-width: 720px) {
          .hcb {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "date add"
              "pace pace"
              "mood mood";
            gap: 14px;
            padding: 14px 0 18px;
          }
          .hcb-date { grid-area: date; }
          .hcb-pace { grid-area: pace; min-width: 0; }
          .hcb-pace-label { text-align: left; }
          .hcb-pace-numbers { justify-content: flex-start; }
          .hcb-right { grid-area: mood; justify-content: space-between; }
          .hcb-add { grid-area: add; justify-self: end; }
        }
      `}</style>

      <div className="hcb-date">
        <span className="hcb-eyebrow">Today</span>
        <span className="hcb-day">{dateLine || '—'}</span>
      </div>

      <div className="hcb-pace" style={{ ['--tone' as string]: toneColor }}>
        <div className="hcb-pace-label">Habit progress</div>
        <div className="hcb-pace-numbers">
          <span className="hcb-pace-count">{done}</span>
          <span className="hcb-pace-total">/ {total || 0}</span>
          <span className="hcb-pace-word">{pacePhrase}</span>
        </div>
        <div className="hcb-pace-bar">
          <div className="hcb-pace-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
          {total > 0 && !allDone && now && (
            <div
              className="hcb-pace-bar-marker"
              style={{ left: `${Math.max(0, Math.min(100, Math.round(dayPct * 100)))}%` }}
              title="Where you'd be at even pace"
            />
          )}
        </div>
      </div>

      <div className="hcb-right">
        <div className="hcb-mood-row">
          {MOOD_TONES.map((tone, i) => {
            const value = i + 1;
            const on = currentMood === value;
            return (
              <button
                key={value}
                type="button"
                className={`hcb-mood-pill${on ? ' on' : ''}`}
                style={{ ['--mood-tone' as string]: tone }}
                onClick={() => setMood(value)}
                disabled={savingMood !== null}
                aria-label={`Set mood ${value}`}
                aria-pressed={on}
              />
            );
          })}
        </div>
        <button
          type="button"
          className="hcb-add"
          onClick={focusTaskInput}
          aria-label="Add task"
          title="Add task"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
