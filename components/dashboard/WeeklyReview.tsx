'use client';
import { useEffect, useRef, useState } from 'react';
import Markdown from '@/components/coach/Markdown';
import { useToast } from '@/components/layout/Toast';

interface ReviewData { summary: string; wins: string[]; improvements: string[]; plan: string[] }
interface CacheResponse { week_start: string; review: ReviewData | null; generated_at: string | null }

function weekStartSunday(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

/**
 * Loads the cached review on mount. If absent and today is Sunday/Monday (the
 * natural "end of week" window) it auto-generates in the background.
 */
export default function WeeklyReview() {
  const toast = useToast();
  const [data, setData] = useState<ReviewData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const weekStart = weekStartSunday();
  const autoFired = useRef(false);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/weekly-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const review = await res.json() as ReviewData & { error?: string };
      if (!res.ok || review.error) throw new Error(review.error ?? `HTTP ${res.status}`);
      setData(review);
      setGeneratedAt(new Date().toISOString());
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? `Review failed: ${e.message}` : 'Review failed' });
    } finally { setLoading(false); }
  }

  // Phase 3 #12: auto-trigger on first load of week if no cache yet, not just
  // Sunday/Monday. Anyone opening the app mid-week should get this week's review.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/ai/weekly-review?week_start=${weekStart}`);
        const cache = await res.json() as CacheResponse;
        if (cache.review) {
          setData(cache.review);
          setGeneratedAt(cache.generated_at);
          return;
        }
        if (!autoFired.current) {
          autoFired.current = true;
          regenerate();
        }
      } catch { /* silent — cache fetch failure shouldn't toast */ }
    })();
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide entirely when there's nothing to show and we aren't actively generating.
  if (!data && !loading) return null;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>Weekly Review</div>
        <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={regenerate} disabled={loading}>
          {loading ? 'Generating…' : '↺ Regenerate'}
        </button>
      </div>
      {generatedAt && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 12 }}>
          week of {weekStart} · generated {new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <Markdown text={data.summary} />
          </div>

          {[
            { label: '✓ Wins', items: data.wins, color: 'var(--success)', bg: 'rgba(107,227,164,0.06)', border: 'rgba(107,227,164,0.15)' },
            { label: '↑ To Improve', items: data.improvements, color: '#F2C063', bg: 'rgba(242,192,99,0.06)', border: 'rgba(242,192,99,0.15)' },
            { label: '→ Next week', items: data.plan, color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)' },
          ].map(section => section.items?.length ? (
            <div key={section.label} style={{ padding: '12px 14px', borderRadius: 12, background: section.bg, border: `1px solid ${section.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: section.color, marginBottom: 10 }}>{section.label}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {section.items.map((item, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                    <span style={{ color: section.color, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>–</span>
                    <div style={{ flex: 1, minWidth: 0 }}><Markdown text={item} /></div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}
