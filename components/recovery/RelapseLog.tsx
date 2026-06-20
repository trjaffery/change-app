'use client';
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/components/layout/Toast';

interface Relapse { id: string; note: string; created_at: string }

/**
 * Logging a relapse no longer uses native confirm()/prompt() dialogs. The button
 * expands to an inline form (intensity-style) so the user can write a note and
 * confirm the reset in-place. On save, the parent's onRelapse callback fires;
 * the page wires that to bump StreakCard's refreshKey so the streak re-anchors
 * immediately.
 */
export default function RelapseLog({ onRelapse }: { onRelapse?: () => void }) {
  const toast = useToast();
  const [relapses, setRelapses] = useState<Relapse[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchRelapses = useCallback(async () => {
    try {
      const res = await fetch('/api/recovery/relapses');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRelapses(await res.json());
    } catch {
      toast({ kind: 'error', message: "Couldn't load relapses" });
    }
  }, [toast]);

  useEffect(() => { fetchRelapses(); }, [fetchRelapses]);

  async function submitRelapse() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/recovery/relapses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNote('');
      setOpen(false);
      fetchRelapses();
      onRelapse?.();
    } catch {
      toast({ kind: 'error', message: "Couldn't log relapse" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRelapse(id: string) {
    try {
      const res = await fetch(`/api/recovery/relapses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmDeleteId(null);
      fetchRelapses();
      onRelapse?.(); // streak anchor may shift back if you delete the most recent
    } catch {
      toast({ kind: 'error', message: "Couldn't delete" });
    }
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .rl-trigger {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 16px; border-radius: 10px;
          background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.28);
          color: var(--danger); font-family: var(--font-sans); font-size: 13px; font-weight: 700;
          letter-spacing: 0.02em; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background 160ms ease;
        }
        .rl-trigger:hover { background: rgba(255,107,107,0.14); }
        .rl-panel {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(255,107,107,0.04);
          border: 1px solid rgba(255,107,107,0.22);
          display: flex; flex-direction: column; gap: 12px;
        }
        .rl-panel-head { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
        .rl-panel textarea {
          width: 100%; min-height: 64px; resize: vertical;
          padding: 9px 11px; border-radius: 8px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-primary);
          font-family: var(--font-sans); font-size: 14px; line-height: 1.45;
          outline: none;
        }
        .rl-panel-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .rl-cancel, .rl-confirm {
          padding: 7px 12px; border-radius: 8px; cursor: pointer;
          font-family: var(--font-mono); font-size: 11px; font-weight: 700;
          letter-spacing: 0.06em; border: 1px solid;
          -webkit-tap-highlight-color: transparent;
        }
        .rl-cancel { background: transparent; border-color: rgba(255,255,255,0.1); color: var(--text-tertiary); }
        .rl-confirm { background: rgba(255,107,107,0.16); border-color: rgba(255,107,107,0.4); color: var(--danger); }
        .rl-confirm:disabled { opacity: 0.5; cursor: default; }
        .rl-entry { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(255,107,107,0.04); border: 1px solid rgba(255,107,107,0.12); margin-bottom: 6px; }
        .rl-entry-body { flex: 1; min-width: 0; }
        .rl-entry-del { background: transparent; border: none; color: var(--text-tertiary); cursor: pointer; padding: 4px; opacity: 0; transition: opacity 0.15s; }
        .rl-entry:hover .rl-entry-del { opacity: 0.4; }
        .rl-entry-del:hover { opacity: 1 !important; color: var(--danger); }
        .rl-confirm-inline { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; color: var(--danger); display: inline-flex; gap: 6px; align-items: center; }
        .rl-confirm-inline button { padding: 2px 6px; border-radius: 6px; border: 1px solid; font-family: var(--font-mono); font-size: 10px; cursor: pointer; }
        .rl-confirm-inline .yes { background: rgba(255,107,107,0.18); border-color: rgba(255,107,107,0.4); color: var(--danger); }
        .rl-confirm-inline .no { background: transparent; border-color: rgba(255,255,255,0.1); color: var(--text-tertiary); }
      `}</style>
      <div className="section-title">Relapse Log</div>
      {!open && (
        <button className="rl-trigger" onClick={() => setOpen(true)}>
          Log Relapse
        </button>
      )}
      {open && (
        <div className="rl-panel">
          <div className="rl-panel-head">
            This will reset your sobriety counter. Want to write a note about what happened?
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What was going on (optional)…"
            autoFocus
            autoCapitalize="sentences"
          />
          <div className="rl-panel-actions">
            <button className="rl-cancel" onClick={() => { setOpen(false); setNote(''); }} disabled={saving}>Cancel</button>
            <button className="rl-confirm" onClick={submitRelapse} disabled={saving}>
              {saving ? 'Logging…' : 'Confirm reset'}
            </button>
          </div>
        </div>
      )}

      {relapses.map(r => {
        const d = new Date(r.created_at);
        const ts = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return (
          <div key={r.id} className="rl-entry" style={{ marginTop: 12 }}>
            <div className="rl-entry-body">
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.note || 'No note'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{ts}</div>
              {confirmDeleteId === r.id && (
                <div className="rl-confirm-inline" style={{ marginTop: 6 }}>
                  Delete this relapse?
                  <button className="yes" onClick={() => deleteRelapse(r.id)}>Yes</button>
                  <button className="no" onClick={() => setConfirmDeleteId(null)}>No</button>
                </div>
              )}
            </div>
            {confirmDeleteId !== r.id && (
              <button className="rl-entry-del" onClick={() => setConfirmDeleteId(r.id)} aria-label="Delete relapse">
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            )}
          </div>
        );
      })}
      {relapses.length === 0 && !open && <div className="empty-state" style={{ marginTop: 10 }}>No relapses recorded — keep going.</div>}
    </div>
  );
}
