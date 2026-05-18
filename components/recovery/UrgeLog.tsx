'use client';
import { useCallback, useEffect, useState } from 'react';

interface Urge { id: string; intensity: number; note: string; created_at: string }

export default function UrgeLog({ onUrgeLogged }: { onUrgeLogged?: () => void }) {
  const [urges, setUrges] = useState<Urge[]>([]);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');

  const fetchUrges = useCallback(async () => {
    const res = await fetch('/api/recovery/urges');
    setUrges(await res.json());
  }, []);

  useEffect(() => { fetchUrges(); }, [fetchUrges]);

  async function logUrge() {
    await fetch('/api/recovery/urges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intensity, note }),
    });
    setNote(''); setIntensity(3);
    fetchUrges(); onUrgeLogged?.();
  }

  async function deleteUrge(id: string) {
    await fetch(`/api/recovery/urges/${id}`, { method: 'DELETE' });
    fetchUrges(); onUrgeLogged?.();
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
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-title">Log an Urge</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="urge-label" htmlFor="urge-intensity">Intensity</label>
            <input id="urge-intensity" type="range" className="urge-slider" min={1} max={5} value={intensity} onChange={e => setIntensity(Number(e.target.value))} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: 'var(--warning)', width: 24, textAlign: 'center' }}>{intensity}</span>
          </div>
          <input className="text-input" type="text" placeholder="Optional note…" style={{ width: '100%' }} value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && logUrge()} />
          <div><button className="btn-primary" style={{ padding: '10px 18px', fontSize: 13 }} onClick={logUrge}>Log Urge</button></div>
        </div>
        {urges.slice(0, 10).map(u => {
          const d = new Date(u.created_at);
          const ts = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          return (
            <div key={u.id} className="urge-entry">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: 'var(--warning)', width: 20, flexShrink: 0 }}>{u.intensity}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.note || 'No note'}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{ts}</div>
              </div>
              <button className="urge-delete" onClick={() => deleteUrge(u.id)}>×</button>
            </div>
          );
        })}
        {urges.length === 0 && <div className="empty-state">No urges logged yet.</div>}
      </div>
    </>
  );
}
