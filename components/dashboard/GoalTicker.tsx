'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

interface Goal { id: string; text: string; done: boolean }

// Polls every 3s as a safety net but most updates arrive instantly via the
// 'goals-changed' window event that DailyGoals dispatches on mutate. Cheap GET.
const POLL_MS = 3000;
// How long each goal stays on screen before rotating to the next.
const ROTATE_MS = 3500;

export default function GoalTicker() {
  const today = getActiveDateString();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [fading, setFading] = useState(false);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch(`/api/goals?date=${today}`);
      const data = (await res.json()) as Goal[];
      setGoals(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [today]);

  useEffect(() => {
    fetchGoals();
    const id = setInterval(fetchGoals, POLL_MS);
    function onMut() { fetchGoals(); }
    window.addEventListener('goals-changed', onMut);
    return () => {
      clearInterval(id);
      window.removeEventListener('goals-changed', onMut);
    };
  }, [fetchGoals]);

  const pending = goals.filter(g => !g.done);
  const total = goals.length;
  const done = total - pending.length;

  // Pick the next id to show. If the currently-shown id is still pending,
  // keep it; otherwise advance to the next pending one in list order. This
  // replaces the old "snap idx to 0" jank when the visible goal gets ticked.
  const shownIdRef = useRef<string | null>(null);
  useEffect(() => { shownIdRef.current = shownId; }, [shownId]);
  useEffect(() => {
    if (pending.length === 0) { setShownId(null); return; }
    const stillThere = pending.find(g => g.id === shownIdRef.current);
    if (!stillThere) setShownId(pending[0].id);
  }, [pending]);

  // Rotate through pending goals smoothly.
  useEffect(() => {
    if (pending.length <= 1) return;
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setShownId(curr => {
          const i = pending.findIndex(g => g.id === curr);
          const next = pending[(i + 1) % pending.length];
          return next?.id ?? null;
        });
        setFading(false);
      }, 220);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [pending]);

  if (total === 0) return null;

  const allDone = pending.length === 0;
  const current = pending.find(g => g.id === shownId) ?? pending[0];
  const tone = allDone ? '#6BE3A4' : '#F2C063';

  return (
    <div
      style={{
        marginBottom: 18,
        padding: '10px 14px',
        borderRadius: 12,
        background: allDone ? 'rgba(107,227,164,0.06)' : 'rgba(242,192,99,0.05)',
        border: `1px solid ${allDone ? 'rgba(107,227,164,0.18)' : 'rgba(242,192,99,0.16)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <style>{`
        @keyframes gt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
        .gt-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .gt-dot.pulse { animation: gt-pulse 1.6s ease-in-out infinite; }
        .gt-text { font-size: 13px; color: var(--text-primary); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity 0.2s ease; }
        .gt-text.fading { opacity: 0; }
        .gt-ratio { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; flex-shrink: 0; }
      `}</style>

      <span className={`gt-dot${allDone ? '' : ' pulse'}`} style={{ background: tone, boxShadow: `0 0 8px ${tone}80` }} />

      <span className={`gt-text${fading ? ' fading' : ''}`}>
        {allDone ? 'All goals done — alhamdulillah.' : current?.text}
      </span>

      <span className="gt-ratio" style={{ color: allDone ? 'var(--success)' : 'var(--text-tertiary)' }}>
        {done}/{total}
      </span>
    </div>
  );
}
