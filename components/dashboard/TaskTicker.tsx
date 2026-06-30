'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';

interface Task { id: string; text: string; done: boolean }

// Polls every 3s as a safety net; most updates arrive instantly via the
// 'tasks-changed' window event that DailyTasks dispatches on mutate.
const POLL_MS = 3000;
const ROTATE_MS = 3500;

export default function TaskTicker() {
  const today = getActiveDateString();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [fading, setFading] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?date=${today}`);
      const data = await res.json() as Task[];
      setTasks(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [today]);

  useEffect(() => {
    fetchTasks();
    const id = setInterval(fetchTasks, POLL_MS);
    function onMut() { fetchTasks(); }
    window.addEventListener('tasks-changed', onMut);
    return () => {
      clearInterval(id);
      window.removeEventListener('tasks-changed', onMut);
    };
  }, [fetchTasks]);

  const pending = tasks.filter(t => !t.done);
  const total = tasks.length;
  const done = total - pending.length;

  const shownIdRef = useRef<string | null>(null);
  useEffect(() => { shownIdRef.current = shownId; }, [shownId]);
  useEffect(() => {
    if (pending.length === 0) { setShownId(null); return; }
    const stillThere = pending.find(t => t.id === shownIdRef.current);
    if (!stillThere) setShownId(pending[0].id);
  }, [pending]);

  useEffect(() => {
    if (pending.length <= 1) return;
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setShownId(curr => {
          const i = pending.findIndex(t => t.id === curr);
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
  const current = pending.find(t => t.id === shownId) ?? pending[0];
  const tone = allDone ? '#6BE3A4' : '#F2C063';

  return (
    <div
      style={{
        marginBottom: 18, padding: '10px 14px', borderRadius: 12,
        background: allDone ? 'rgba(107,227,164,0.06)' : 'rgba(242,192,99,0.05)',
        border: `1px solid ${allDone ? 'rgba(107,227,164,0.18)' : 'rgba(242,192,99,0.16)'}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <style>{`
        @keyframes tt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
        .tt-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .tt-dot.pulse { animation: tt-pulse 1.6s ease-in-out infinite; }
        .tt-text { font-size: 13px; color: var(--text-primary); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity 0.2s ease; }
        .tt-text.fading { opacity: 0; }
        .tt-ratio { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; flex-shrink: 0; }
      `}</style>

      <span className={`tt-dot${allDone ? '' : ' pulse'}`} style={{ background: tone, boxShadow: `0 0 8px ${tone}80` }} />
      <span className={`tt-text${fading ? ' fading' : ''}`}>
        {allDone ? 'All tasks done — alhamdulillah.' : current?.text}
      </span>
      <span className="tt-ratio" style={{ color: allDone ? 'var(--success)' : 'var(--text-tertiary)' }}>
        {done}/{total}
      </span>
    </div>
  );
}
