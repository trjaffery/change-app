'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, X, LifeBuoy } from 'lucide-react';

interface Urge { id: string; intensity: number; note: string; tags?: string[]; triggers?: string[]; halt?: string[]; is_crisis?: boolean; created_at: string }
interface EditDraft { intensity: number; tags: Set<string>; note: string; is_crisis: boolean }

// Legacy back-compat: pre-migration urges may still carry triggers[] / halt[].
const HALT_CODE_TO_LABEL: Record<string, string> = { H: 'Hungry', A: 'Angry', L: 'Lonely', T: 'Tired' };
function tagsOf(u: Urge): string[] {
  if (Array.isArray(u.tags) && u.tags.length > 0) return u.tags;
  const out = new Set<string>();
  for (const t of u.triggers ?? []) out.add(t);
  for (const c of u.halt ?? []) if (HALT_CODE_TO_LABEL[c]) out.add(HALT_CODE_TO_LABEL[c]);
  return [...out];
}

const DEFAULT_SUGGESTIONS = ['Stress', 'Boredom', 'Hungry', 'Angry', 'Lonely', 'Tired'];
const MAX_SUGGESTIONS = 12;
const INITIAL_PAGE = 10;
const NEXT_PAGE = 20;

function parseRpPlanTriggers(s: string): string[] {
  return s.split(/[\n,]/).map(x => x.trim()).filter(Boolean);
}

export default function UrgeLog({ onUrgeLogged }: { onUrgeLogged?: () => void }) {
  const [urges, setUrges] = useState<Urge[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isCrisisDraft, setIsCrisisDraft] = useState(false);
  const [planTriggers, setPlanTriggers] = useState<string[]>([]);
  const [customInputOpen, setCustomInputOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [editCustomOpen, setEditCustomOpen] = useState(false);
  const [editCustom, setEditCustom] = useState('');
  const editCustomRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const fetchUrges = useCallback(async (preserveLen?: number) => {
    const desired = Math.max(INITIAL_PAGE, preserveLen ?? 0);
    const res = await fetch(`/api/recovery/urges?limit=${desired}&offset=0`);
    const data = (await res.json()) as Urge[];
    setUrges(Array.isArray(data) ? data : []);
    const totalHeader = res.headers.get('X-Total-Count');
    setTotal(totalHeader ? Number(totalHeader) : (Array.isArray(data) ? data.length : 0));
  }, []);

  useEffect(() => { fetchUrges(); }, [fetchUrges]);

  // Pull RP plan triggers as a tag-suggestion source. The user already named
  // their personal triggers there — those should be one tap away here.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/recovery/rp-plan');
        const data = await res.json() as { triggers?: string };
        setPlanTriggers(parseRpPlanTriggers(data.triggers ?? ''));
      } catch { /* leave empty */ }
    })();
  }, []);

  // Build the suggestion list. Order:
  //   1. Tags the user actually uses most (from existing urges, weighted by frequency)
  //   2. Tags they put in their RP plan
  //   3. A small fallback default set so a brand-new user has anything to tap
  // De-duped, case-insensitive on the dedupe key.
  const suggestions = useMemo(() => {
    const freq = new Map<string, number>();
    for (const u of urges) for (const t of tagsOf(u)) freq.set(t, (freq.get(t) ?? 0) + 1);
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (raw: string) => {
      const t = raw.trim(); if (!t) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k); out.push(t);
    };
    [...freq.entries()].sort((a, b) => b[1] - a[1]).forEach(([t]) => add(t));
    planTriggers.forEach(add);
    DEFAULT_SUGGESTIONS.forEach(add);
    return out.slice(0, MAX_SUGGESTIONS);
  }, [urges, planTriggers]);

  function toggle(tag: string) {
    setSelected(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });
  }

  function commitCustom() {
    const t = customInput.trim();
    if (t) setSelected(prev => new Set(prev).add(t));
    setCustomInput('');
    setCustomInputOpen(false);
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/recovery/urges?limit=${NEXT_PAGE}&offset=${urges.length}`);
      const more = (await res.json()) as Urge[];
      if (Array.isArray(more) && more.length) setUrges(prev => [...prev, ...more]);
      const totalHeader = res.headers.get('X-Total-Count');
      if (totalHeader) setTotal(Number(totalHeader));
    } finally { setLoadingMore(false); }
  }

  async function logUrge() {
    await fetch('/api/recovery/urges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intensity, note, tags: [...selected], is_crisis: isCrisisDraft }),
    });
    setNote(''); setIntensity(3); setSelected(new Set()); setCustomInput(''); setCustomInputOpen(false); setIsCrisisDraft(false);
    fetchUrges(urges.length + 1); onUrgeLogged?.();
  }

  async function deleteUrge(id: string) {
    await fetch(`/api/recovery/urges/${id}`, { method: 'DELETE' });
    fetchUrges(urges.length); onUrgeLogged?.();
  }

  function isCrisis(u: Urge): boolean {
    return !!u.is_crisis || (u.note ?? '').startsWith('[crisis-mode]');
  }

  function startEdit(u: Urge) {
    setEditingId(u.id);
    // Strip the legacy [crisis-mode] prefix from the note for cleaner editing —
    // we capture that as the structural is_crisis flag instead.
    const cleanNote = (u.note ?? '').replace(/^\[crisis-mode\]\s*/, '');
    setDraft({ intensity: u.intensity, tags: new Set(tagsOf(u)), note: cleanNote, is_crisis: isCrisis(u) });
    setEditCustomOpen(false); setEditCustom('');
  }

  function cancelEdit() {
    setEditingId(null); setDraft(null);
    setEditCustomOpen(false); setEditCustom('');
  }

  function patchDraft(p: Partial<EditDraft>) { setDraft(d => d ? { ...d, ...p } : d); }
  function toggleDraftTag(t: string) {
    if (!draft) return;
    patchDraft({
      tags: (() => { const n = new Set(draft.tags); n.has(t) ? n.delete(t) : n.add(t); return n; })(),
    });
  }
  function commitEditCustom() {
    if (!draft) return;
    const t = editCustom.trim();
    if (t) patchDraft({ tags: new Set([...draft.tags, t]) });
    setEditCustom(''); setEditCustomOpen(false);
  }

  async function saveEdit() {
    if (!editingId || !draft || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/recovery/urges/${editingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intensity: draft.intensity,
          note: draft.note,
          tags: [...draft.tags],
          is_crisis: draft.is_crisis,
        }),
      });
      cancelEdit();
      fetchUrges(urges.length);
      onUrgeLogged?.();
    } finally { setSaving(false); }
  }

  // Show all selected chips first (some may not be in suggestions if user typed
  // them) then the rest of the suggestions list.
  const chipOrder: string[] = [];
  const inOrder = new Set<string>();
  for (const t of selected) { if (!inOrder.has(t.toLowerCase())) { chipOrder.push(t); inOrder.add(t.toLowerCase()); } }
  for (const t of suggestions) { if (!inOrder.has(t.toLowerCase())) { chipOrder.push(t); inOrder.add(t.toLowerCase()); } }

  return (
    <>
      <style>{`
        .urge-entry { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05); margin-bottom:6px; }
        .urge-entry.crisis { border-left: 3px solid var(--danger); padding-left: 10px; }
        .urge-actions { display: inline-flex; gap: 6px; margin-left: auto; flex-shrink: 0; align-self: flex-start; }
        .urge-edit-btn, .urge-delete { background:none; border:none; color:var(--text-tertiary); cursor:pointer; padding:2px 4px; opacity:0; transition:opacity 0.15s, color 0.15s; line-height:1.2; -webkit-tap-highlight-color: transparent; }
        .urge-entry:hover .urge-edit-btn, .urge-entry:hover .urge-delete { opacity:0.4; }
        .urge-edit-btn:hover { opacity:1 !important; color:var(--text-secondary); }
        .urge-delete { font-size: 16px; }
        .urge-delete:hover { opacity:1 !important; color:var(--danger); }
        .urge-crisis-pill { display:inline-flex; align-items:center; gap:3px; font-family: var(--font-mono); font-size: 9px; font-weight: 800; letter-spacing: 0.12em; color: var(--danger); padding: 1px 6px; border-radius: 10px; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.25); }
        .urge-edit-panel { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 10px; }
        .urge-edit-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .urge-edit-note { width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: var(--text-primary); font-family: var(--font-sans); font-size: 13px; outline: none; }
        .urge-edit-crisis { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; }
        .urge-edit-crisis input { accent-color: var(--danger); cursor: pointer; width: 14px; height: 14px; }
        .urge-edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .urge-edit-save, .urge-edit-cancel { padding: 6px 12px; border-radius: 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; -webkit-tap-highlight-color: transparent; border: 1px solid; }
        .urge-edit-save { background: rgba(107,227,164,0.12); border-color: rgba(107,227,164,0.35); color: var(--success); }
        .urge-edit-cancel { background: transparent; border-color: rgba(255,255,255,0.1); color: var(--text-tertiary); }
        .urge-slider { flex:1; accent-color:var(--warning); cursor:pointer; }
        .urge-label { font-size:11px; font-weight:600; letter-spacing:0.10em; text-transform:uppercase; color:var(--text-tertiary); flex-shrink:0; min-width:60px; }
        .tag-chip { padding: 4px 10px; border-radius: 20px; border: 1px solid; font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); transition: all 0.15s; -webkit-tap-highlight-color: transparent; display: inline-flex; align-items: center; gap: 5px; }
        .tag-chip.on { background: rgba(242,192,99,0.14); border-color: rgba(242,192,99,0.5); color: #F2C063; }
        .tag-chip.off { background: transparent; border-color: rgba(255,255,255,0.1); color: var(--text-tertiary); }
        .tag-chip.off:hover { color: var(--text-secondary); border-color: rgba(255,255,255,0.18); }
        .tag-chip .x { width: 12px; height: 12px; display: inline-flex; }
        .tag-add { padding: 4px 10px; border-radius: 20px; border: 1px dashed rgba(255,255,255,0.18); background: transparent; color: var(--text-tertiary); font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; -webkit-tap-highlight-color: transparent; }
        .tag-add:hover { color: var(--text-secondary); }
        .tag-input { padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(242,192,99,0.4); background: rgba(242,192,99,0.05); color: var(--text-primary); font-size: 11px; font-weight: 600; outline: none; min-width: 90px; max-width: 160px; font-family: var(--font-sans); }
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
            {chipOrder.map(t => {
              const on = selected.has(t);
              return (
                <button key={t} onClick={() => toggle(t)} className={`tag-chip ${on ? 'on' : 'off'}`}>
                  {t}
                  {on && <span className="x"><X size={11} strokeWidth={2.25} /></span>}
                </button>
              );
            })}
            {!customInputOpen && (
              <button
                className="tag-add"
                onClick={() => { setCustomInputOpen(true); requestAnimationFrame(() => customInputRef.current?.focus()); }}
              >
                <Plus size={11} strokeWidth={2.25} /> Add
              </button>
            )}
            {customInputOpen && (
              <input
                ref={customInputRef}
                className="tag-input"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitCustom(); }
                  else if (e.key === 'Escape') { setCustomInput(''); setCustomInputOpen(false); }
                }}
                onBlur={commitCustom}
                placeholder="new tag"
                autoCapitalize="none"
                autoCorrect="off"
              />
            )}
          </div>

          <input className="text-input" type="text" placeholder="Optional note…" style={{ width: '100%' }} value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && logUrge()} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <label className="urge-edit-crisis" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={isCrisisDraft} onChange={e => setIsCrisisDraft(e.target.checked)} />
              Mark as crisis
            </label>
            <button className="btn-primary" style={{ padding: '10px 18px', fontSize: 13 }} onClick={logUrge}>Log Urge</button>
          </div>
        </div>

        {urges.length > 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: 8 }}>
            Showing {urges.length} of {total} logged
          </div>
        )}

        {urges.map(u => {
          const d = new Date(u.created_at);
          const ts = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          const tags = tagsOf(u);
          const crisis = isCrisis(u);
          const editing = editingId === u.id;
          // Edit-panel chip order: selected first, then the same global suggestions list.
          const editTags = editing && draft ? draft.tags : new Set<string>();
          const editChipOrder: string[] = [];
          const editSeen = new Set<string>();
          for (const t of editTags) { if (!editSeen.has(t.toLowerCase())) { editChipOrder.push(t); editSeen.add(t.toLowerCase()); } }
          for (const t of suggestions) { if (!editSeen.has(t.toLowerCase())) { editChipOrder.push(t); editSeen.add(t.toLowerCase()); } }
          return (
            <div key={u.id} className={`urge-entry${crisis ? ' crisis' : ''}`}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: crisis ? 'var(--danger)' : 'var(--warning)', width: 20, flexShrink: 0 }}>{u.intensity}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {(u.note ?? '').replace(/^\[crisis-mode\]\s*/, '') || 'No note'}
                </div>
                {(tags.length > 0 || crisis) && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                    {crisis && (
                      <span className="urge-crisis-pill"><LifeBuoy size={9} strokeWidth={2.25} /> CRISIS</span>
                    )}
                    {tags.map(t => (
                      <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: 'rgba(242,192,99,0.1)', color: '#F2C063', letterSpacing: '0.05em' }}>{t}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{ts}</div>

                {editing && draft && (
                  <div className="urge-edit-panel" onClick={e => e.stopPropagation()}>
                    <div className="urge-edit-row">
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>INTENSITY</span>
                      <input type="range" className="urge-slider" min={1} max={5} value={draft.intensity} onChange={e => patchDraft({ intensity: Number(e.target.value) })} style={{ flex: 1 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: 'var(--warning)', width: 20, textAlign: 'center' }}>{draft.intensity}</span>
                    </div>
                    <div className="urge-edit-row">
                      {editChipOrder.map(t => {
                        const on = draft.tags.has(t);
                        return (
                          <button key={t} onClick={() => toggleDraftTag(t)} className={`tag-chip ${on ? 'on' : 'off'}`}>
                            {t}{on && <span className="x"><X size={11} strokeWidth={2.25} /></span>}
                          </button>
                        );
                      })}
                      {!editCustomOpen && (
                        <button className="tag-add" onClick={() => { setEditCustomOpen(true); requestAnimationFrame(() => editCustomRef.current?.focus()); }}>
                          <Plus size={11} strokeWidth={2.25} /> Add
                        </button>
                      )}
                      {editCustomOpen && (
                        <input
                          ref={editCustomRef}
                          className="tag-input"
                          value={editCustom}
                          onChange={e => setEditCustom(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitEditCustom(); }
                            else if (e.key === 'Escape') { setEditCustom(''); setEditCustomOpen(false); }
                          }}
                          onBlur={commitEditCustom}
                          placeholder="new tag"
                          autoCapitalize="none"
                          autoCorrect="off"
                        />
                      )}
                    </div>
                    <input
                      className="urge-edit-note"
                      type="text"
                      value={draft.note}
                      onChange={e => patchDraft({ note: e.target.value })}
                      placeholder="Note…"
                    />
                    <label className="urge-edit-crisis">
                      <input type="checkbox" checked={draft.is_crisis} onChange={e => patchDraft({ is_crisis: e.target.checked })} />
                      Mark as crisis
                    </label>
                    <div className="urge-edit-actions">
                      <button className="urge-edit-cancel" onClick={cancelEdit}>Cancel</button>
                      <button className="urge-edit-save" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="urge-actions">
                <button className="urge-edit-btn" onClick={() => editing ? cancelEdit() : startEdit(u)} aria-label="Edit">
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
                <button className="urge-delete" onClick={() => deleteUrge(u.id)} aria-label="Delete">×</button>
              </div>
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
