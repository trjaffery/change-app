'use client';
import { useCallback, useEffect, useState } from 'react';

interface Relapse { id: string; note: string; created_at: string }

export default function RelapseLog({ onRelapse }: { onRelapse?: () => void }) {
  const [relapses, setRelapses] = useState<Relapse[]>([]);

  const fetchRelapses = useCallback(async () => {
    const res = await fetch('/api/recovery/relapses');
    setRelapses(await res.json());
  }, []);

  useEffect(() => { fetchRelapses(); }, [fetchRelapses]);

  async function logRelapse() {
    if (!confirm('Log a relapse? This will reset your sobriety counter.')) return;
    const note = prompt('Optional note — what happened?') ?? '';
    await fetch('/api/recovery/relapses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    fetchRelapses(); onRelapse?.();
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Relapse Log</div>
      <button className="btn-danger" onClick={logRelapse}>Log Relapse</button>
      {relapses.map(r => {
        const d = new Date(r.created_at);
        const ts = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return (
          <div key={r.id} style={{ display: 'flex', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,107,107,0.04)', border: '1px solid rgba(255,107,107,0.12)', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.note || 'No note'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{ts}</div>
            </div>
          </div>
        );
      })}
      {relapses.length === 0 && <div className="empty-state">No relapses recorded — keep going.</div>}
    </div>
  );
}
