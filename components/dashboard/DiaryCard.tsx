'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveDateString } from '@/lib/dates';

interface Entry { date: string; body: string; mood: number | null; updated_at: string }

const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4'];

/**
 * Dashboard link card for /diary. Shows today's entry preview and an inline
 * mood picker so mood can be set without leaving Home. The mood buttons stop
 * propagation so tapping them doesn't also follow the outer Link.
 */
export default function DiaryCard() {
  const today = getActiveDateString();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMood, setSavingMood] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/diary/${today}`);
      setEntry((await res.json()) as Entry | null);
    } finally {
      setLoading(false);
    }
  }, [today]);
  useEffect(() => { load(); }, [load]);

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
      if (res.ok) {
        const updated = await res.json();
        setEntry(updated as Entry);
      }
    } finally {
      setSavingMood(null);
    }
  }

  if (loading) return null;

  const filled = !!entry?.body?.trim();
  const preview = filled ? entry!.body.replace(/\s+/g, ' ').trim() : '';
  const currentMood = entry?.mood ?? null;

  return (
    <div style={{ marginBottom: 22 }}>
      <style>{`
        .dc-card {
          padding: 16px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.05);
          background:
            radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0.025) 100%),
            rgba(255,255,255,0.04);
          backdrop-filter: blur(28px) saturate(1.25);
          -webkit-backdrop-filter: blur(28px) saturate(1.25);
          box-shadow: 0 10px 36px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.045);
          transition: border-color 200ms ease;
        }
        .dc-card:hover { border-color: rgba(255,255,255,0.1); }
        .dc-link {
          display: block; text-decoration: none; color: inherit;
          padding-bottom: 12px;
        }
        .dc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .dc-label {
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          color: var(--text-tertiary); letter-spacing: 0.18em; text-transform: uppercase;
        }
        .dc-preview {
          font-family: var(--font-serif); font-style: italic;
          font-size: 15px; line-height: 1.45;
          color: var(--text-secondary);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .dc-cta {
          display: flex; align-items: center; justify-content: space-between;
          color: var(--text-secondary);
        }
        .dc-cta-text { font-size: 14px; }
        .dc-cta-arrow { font-family: var(--font-mono); font-size: 14px; color: var(--text-tertiary); }
        .dc-mood-row {
          display: flex; align-items: center; gap: 8px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .dc-mood-label {
          font-family: var(--font-mono); font-size: 9px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-tertiary); margin-right: 2px;
        }
        .dc-mood-pill {
          width: 26px; height: 26px; border-radius: 50%;
          border: 1.5px solid transparent;
          cursor: pointer; padding: 0;
          background: transparent;
          transition: transform 140ms ease, border-color 160ms ease;
          -webkit-tap-highlight-color: transparent;
          position: relative;
        }
        .dc-mood-pill::before {
          content: ''; position: absolute; inset: 4px;
          border-radius: 50%; background: var(--mood-tone);
          opacity: 0.45; transition: opacity 160ms ease;
        }
        .dc-mood-pill.on { border-color: var(--mood-tone); }
        .dc-mood-pill.on::before { opacity: 1; }
        .dc-mood-pill:hover::before { opacity: 0.85; }
        .dc-mood-pill:disabled { opacity: 0.5; cursor: default; }
      `}</style>
      <div className="dc-card">
        <Link href="/diary" className="dc-link">
          <div className="dc-head">
            <span className="dc-label">Diary · today</span>
          </div>
          {filled ? (
            <div className="dc-preview">{preview}</div>
          ) : (
            <div className="dc-cta">
              <span className="dc-cta-text">Write today&apos;s entry…</span>
              <span className="dc-cta-arrow">→</span>
            </div>
          )}
        </Link>
        <div className="dc-mood-row">
          <span className="dc-mood-label">Mood</span>
          {MOOD_TONES.map((tone, i) => {
            const value = i + 1;
            const on = currentMood === value;
            return (
              <button
                key={value}
                type="button"
                className={`dc-mood-pill${on ? ' on' : ''}`}
                style={{ ['--mood-tone' as string]: tone }}
                onClick={() => setMood(value)}
                disabled={savingMood !== null}
                aria-label={`Set mood ${value}`}
                aria-pressed={on}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
