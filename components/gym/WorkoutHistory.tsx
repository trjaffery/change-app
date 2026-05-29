'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Session {
  id: string;
  date: string;
  started_at: string;
  duration_seconds: number | null;
  split_days: { name: string } | null;
}
interface SetRow { id: string; exercise: string; reps: number; weight: number }

const PAGE_SIZE = 10;

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function WorkoutHistory({ refreshKey }: { refreshKey: number }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, SetRow[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const fetchPage = useCallback(async (offset: number, replace = false) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    const res = await fetch(`/api/gym/sessions?limit=${PAGE_SIZE}&offset=${offset}`);
    const data: Session[] = await res.json();
    setSessions(prev => replace ? data : [...prev, ...data]);
    if (data.length < PAGE_SIZE) setHasMore(false);
    offsetRef.current = offset + data.length;
    if (offset === 0) setLoading(false); else setLoadingMore(false);
  }, []);

  // Reset and reload when refreshKey changes (e.g. after finishing a workout)
  useEffect(() => {
    offsetRef.current = 0;
    setHasMore(true);
    setExpanded(null);
    fetchPage(0, true);
  }, [fetchPage, refreshKey]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        fetchPage(offsetRef.current);
      }
    }, { rootMargin: '100px' });
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [fetchPage, hasMore, loadingMore]);

  async function deleteSession(id: string) {
    setDeleting(id);
    await fetch(`/api/gym/sessions/${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
    setExpanded(null);
    setDeleting(null);
  }

  async function toggle(session: Session) {
    if (expanded === session.id) { setExpanded(null); return; }
    setExpanded(session.id);
    if (detail[session.date]) return;
    setDetailLoading(session.id);
    const res = await fetch(`/api/gym?date=${session.date}`);
    const sets: SetRow[] = await res.json();
    setDetail(prev => ({ ...prev, [session.date]: sets }));
    setDetailLoading(null);
  }

  if (loading) return null;
  if (!sessions.length) return null;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .wh-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; cursor:pointer; border-radius:8px; transition:background 0.12s; }
        .wh-row:hover { background:rgba(255,255,255,0.02); }
      `}</style>
      <div className="section-title">History</div>
      {sessions.map((session, idx) => {
        const label = session.split_days?.name ?? 'Free workout';
        const dateStr = fmtDate(session.date);
        const duration = session.duration_seconds ? `${Math.round(session.duration_seconds / 60)} min` : null;
        const isOpen = expanded === session.id;
        const sets = detail[session.date];

        // Group sets by exercise
        const grouped: { exercise: string; sets: SetRow[] }[] = [];
        if (sets) {
          const map: Record<string, SetRow[]> = {};
          for (const s of sets) { if (!map[s.exercise]) map[s.exercise] = []; map[s.exercise].push(s); }
          grouped.push(...Object.entries(map).map(([exercise, sets]) => ({ exercise, sets })));
        }

        return (
          <div key={session.id} style={{ borderBottom: idx < sessions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div className="wh-row" onClick={() => toggle(session)}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 10 }}>{dateStr}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {duration && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{duration}</span>
                )}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transform: `rotate(${isOpen ? 180 : 0}deg)`, transition: 'transform 0.2s' }}>
                  <path d="M2 4l4 4 4-4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {isOpen && (
              <div style={{ paddingBottom: 12 }}>
                {detailLoading === session.id && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>Loading…</div>
                )}
                {grouped.map(({ exercise, sets: exSets }) => (
                  <div key={exercise} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{exercise}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {exSets.map((s, i) => (
                        <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                          {s.reps} × {s.weight} lbs
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => deleteSession(session.id)}
                  disabled={deleting === session.id}
                  style={{ marginTop: 8, fontSize: 11, padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,80,80,0.25)', background: 'rgba(255,80,80,0.06)', color: 'rgba(255,100,100,0.8)', cursor: 'pointer', opacity: deleting === session.id ? 0.5 : 1 }}
                >
                  {deleting === session.id ? 'Deleting…' : 'Delete workout'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>Loading…</div>
      )}
      {!hasMore && sessions.length >= PAGE_SIZE && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', padding: '8px 0' }}>All workouts loaded</div>
      )}
    </div>
  );
}
