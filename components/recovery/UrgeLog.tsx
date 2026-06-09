'use client';
import { useCallback, useEffect, useState } from 'react';

interface Urge { id: string; intensity: number; note: string; triggers: string[]; halt?: string[]; created_at: string }

const TRIGGERS = ['Stress', 'Boredom', 'Social', 'Physical', 'Emotional'];
const HALT_OPTS: { code: string; label: string }[] = [
  { code: 'H', label: 'Hungry' },
  { code: 'A', label: 'Angry' },
  { code: 'L', label: 'Lonely' },
  { code: 'T', label: 'Tired' },
];

const INITIAL_PAGE = 10;
const NEXT_PAGE = 20;

export default function UrgeLog({ onUrgeLogged }: { onUrgeLogged?: () => void }) {
  const [urges, setUrges] = useState<Urge[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');
  const [triggers, setTriggers] = useState<Set<string>>(new Set());
  const [halt, setHalt] = useState<Set<string>>(new Set());

  // Reload the list from the top — used after log/delete and on initial mount.
  // We refetch enough rows to cover whatever the user had already expanded to,
  // rounded up to the next page size, so the visible list doesn't shrink.
  const fetchUrges = useCallback(async (preserveLen?: number) => {
    const desired = Math.max(INITIAL_PAGE, preserveLen ?? 0);
    const res = await fetch(`/api/recovery/urges?limit=${desired}&offset=0`);
    const data = (await res.json()) as Urge[];
    setUrges(Array.isArray(data) ? data : []);
    const totalHeader = res.headers.get('X-Total-Count');
    setTotal(totalHeader ? Number(totalHeader) : (Array.isArray(data) ? data.length : 0));
  }, []);

  useEffect(() => { fetchUrges(); }, [fetchUrges]);

  function toggleTrigger(t: string) {
    setTriggers(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }
  function toggleHalt(code: string) {
    setHalt(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/recovery/urges?limit=${NEXT_PAGE}&offset=${urges.length}`);
      const more = (await res.json()) as Urge[];
      if (Array.isArray(more) && more.length) {
        setUrges(prev => [...prev, ...more]);
      }
      const totalHeader = res.headers.get('X-Total-Count');
      if (totalHeader) setTotal(Number(totalHeader));
    } finally {
      setLoadingMore(false);
    }
  }

  async function logUrge() {
    await fetch('/api/recovery/urges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intensity, note, triggers: [...triggers], halt: [...halt] }),
    });
    setNote(''); setIntensity(3); setTriggers(new Set()); setHalt(new Set());
    fetchUrges(urges.length + 1); onUrgeLogged?.();
  }

  async function deleteUrge(id: string) {
    await fetch(`/api/recovery/urges/${id}`, { method: 'DELETE' });
    fetchUrges(urges.length); onUrgeLogged?.();
  }

  return (
    <>
      <style>{`
        .urge-entry { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05); margin-bottom:6px; }
        .urge-delete { background:none; border:none; color:var(--text-tertiary); cursor:pointer; font-size:16px; padding:0 2px; opacity:0; transition:opacity 0.15s; margin-left:auto; flex-shrink:0; line-height:1.2; }
        .urge-entry:hover .urge-delete { opacity:0.4; }
        .urge-delete:hover { opacity:1 !important; color:var(--danger); }
        .urge-slider { flex:1; accent-color:var(--warning); cursor:pointer; }
        .urge-label { font-size:11px; font-weight:600; letter-spacing:0.10em; text-transform:uppercase; color:var(--text-tertiary); flex-shrink:0; min-width:60px; }
      `}</style>
      <div className="card" style={{ marginBottom: 22 }} id="urge-log-card">
        <div className="section-title">Log an Urge</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="urge-label" htmlFor="urge-intensity">Intensity</label>
            <input id="urge-intensity" type="range" className="urge-slider" min={1} max={5} value={intensity} onChange={e => setIntensity(Number(e.target.value))} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: 'var(--warning)', width: 24, textAlign: 'center' }}>{intensity}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TRIGGERS.map(t => (
              <button key={t} onClick={() => toggleTrigger(t)} style={{
                padding: '4px 10px', borderRadius: 20, border: '1px solid',
                borderColor: triggers.has(t) ? 'rgba(242,192,99,0.5)' : 'rgba(255,255,255,0.1)',
                background: triggers.has(t) ? 'rgba(242,192,99,0.12)' : 'transparent',
                color: triggers.has(t) ? '#F2C063' : 'var(--text-tertiary)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                transition: 'all 0.15s',
              }}>{t}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {HALT_OPTS.map(h => {
              const on = halt.has(h.code);
              return (
                <button key={h.code} onClick={() => toggleHalt(h.code)} style={{
                  padding: '4px 10px', borderRadius: 20, border: '1px solid',
                  borderColor: on ? 'rgba(242,192,99,0.5)' : 'rgba(255,255,255,0.1)',
                  background: on ? 'rgba(242,192,99,0.12)' : 'transparent',
                  color: on ? '#F2C063' : 'var(--text-tertiary)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  transition: 'all 0.15s',
                }}>{h.label}</button>
              );
            })}
          </div>
          <input className="text-input" type="text" placeholder="Optional note…" style={{ width: '100%' }} value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && logUrge()} />
          <div><button className="btn-primary" style={{ padding: '10px 18px', fontSize: 13 }} onClick={logUrge}>Log Urge</button></div>
        </div>

        {urges.length > 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: 8 }}>
            Showing {urges.length} of {total} logged
          </div>
        )}

        {urges.map(u => {
          const d = new Date(u.created_at);
          const ts = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          return (
            <div key={u.id} className="urge-entry">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: 'var(--warning)', width: 20, flexShrink: 0 }}>{u.intensity}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.note || 'No note'}</div>
                {u.triggers?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {u.triggers.map(t => (
                      <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: 'rgba(242,192,99,0.1)', color: '#F2C063', letterSpacing: '0.05em' }}>{t}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{ts}</div>
              </div>
              <button className="urge-delete" onClick={() => deleteUrge(u.id)}>×</button>
            </div>
          );
        })}
        {urges.length === 0 && <div className="empty-state">No urges logged yet.</div>}

        {urges.length > 0 && urges.length < total && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            style={{
              marginTop: 8, width: '100%',
              padding: '9px 12px',
              border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: 10,
              background: 'transparent',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: loadingMore ? 'default' : 'pointer',
              transition: 'color 160ms ease, border-color 160ms ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {loadingMore ? 'Loading…' : `Load ${Math.min(NEXT_PAGE, total - urges.length)} more`}
          </button>
        )}
      </div>
    </>
  );
}
