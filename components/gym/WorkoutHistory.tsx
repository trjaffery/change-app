'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Session {
  id: string;
  date: string;
  started_at: string;
  duration_seconds: number | null;
  rpe: number | null;
  notes: string | null;
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

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 22 }}>
        <style>{`
          .wh-sk { background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04)); background-size: 200% 100%; animation: wh-shimmer 1.6s linear infinite; border-radius: 6px; }
          @keyframes wh-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
        `}</style>
        <div className="section-title">History</div>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span className="wh-sk" style={{ width: `${50 - i * 6}%`, height: 13 }} />
            <span className="wh-sk" style={{ width: 52, height: 10 }} />
          </div>
        ))}
      </div>
    );
  }
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
                {(session.rpe !== null || session.notes) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {session.rpe !== null && (() => {
                      const tone = session.rpe! <= 4 ? '#6BE3A4' : session.rpe! <= 7 ? '#F2C063' : '#FF6B6B';
                      return (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', borderRadius: 6, background: `${tone}1A`, border: `1px solid ${tone}55`, color: tone, fontWeight: 700, flexShrink: 0 }}>
                          RPE {session.rpe}
                        </span>
                      );
                    })()}
                    {session.notes && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{session.notes}</span>
                    )}
                  </div>
                )}
                {sets && sets.length > 0 && (() => {
                  const volume = sets.reduce((s, r) => s + r.reps * r.weight, 0);
                  return (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.04em' }}>
                      Volume <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{volume.toLocaleString()} lb</span>
                    </div>
                  );
                })()}
                {grouped.map(({ exercise, sets: exSets }) => {
                  // Top set: max weight, ties broken by reps. 1RM via Epley.
                  const top = exSets.reduce((best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best), exSets[0]);
                  const oneRm = Math.round(top.weight * (1 + top.reps / 30));
                  return (
                    <div key={exercise} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{exercise}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                          est. 1RM <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{oneRm} lb</span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {exSets.map((s, i) => (
                          <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                            {s.reps} × {s.weight} lbs
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
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
