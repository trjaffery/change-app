'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveDateString } from '@/lib/dates';

interface Entry { date: string; body: string; mood: number | null; updated_at: string }

const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4'];

/**
 * Small dashboard card linking to /diary. Shows today's entry preview if
 * written; a CTA prompt otherwise. Keeps the dashboard awareness without
 * dragging the full writing surface onto it.
 */
export default function DiaryCard() {
  const today = getActiveDateString();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return null;

  const filled = !!entry?.body?.trim();
  const moodColor = entry?.mood ? MOOD_TONES[entry.mood - 1] : null;
  const preview = filled ? entry!.body.replace(/\s+/g, ' ').trim() : '';

  return (
    <Link
      href="/diary"
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
        marginBottom: 22,
      }}
    >
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
          transition: border-color 200ms ease, transform 200ms ease;
        }
        .dc-card:hover { border-color: rgba(255,255,255,0.1); }
        .dc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .dc-label {
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          color: var(--text-tertiary); letter-spacing: 0.18em; text-transform: uppercase;
        }
        .dc-mood {
          width: 8px; height: 8px; border-radius: 50%;
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
      `}</style>
      <div className="dc-card">
        <div className="dc-head">
          <span className="dc-label">Diary · today</span>
          {moodColor && <span className="dc-mood" style={{ background: moodColor }} aria-label="Mood" />}
        </div>
        {filled ? (
          <div className="dc-preview">{preview}</div>
        ) : (
          <div className="dc-cta">
            <span className="dc-cta-text">Write today&apos;s entry…</span>
            <span className="dc-cta-arrow">→</span>
          </div>
        )}
      </div>
    </Link>
  );
}
