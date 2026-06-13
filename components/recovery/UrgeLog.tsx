'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

interface Urge { id: string; intensity: number; note: string; tags?: string[]; triggers?: string[]; halt?: string[]; created_at: string }

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
  const [planTriggers, setPlanTriggers] = useState<string[]>([]);
  const [customInputOpen, setCustomInputOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);

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
      body: JSON.stringify({ intensity, note, tags: [...selected] }),
    });
    setNote(''); setIntensity(3); setSelected(new Set()); setCustomInput(''); setCustomInputOpen(false);
    fetchUrges(urges.length + 1); onUrgeLogged?.();
  }

  async function deleteUrge(id: string) {
    await fetch(`/api/recovery/urges/${id}`, { method: 'DELETE' });
    fetchUrges(urges.length); onUrgeLogged?.();
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
        .urge-delete { background:none; border:none; color:var(--text-tertiary); cursor:pointer; font-size:16px; padding:0 2px; opacity:0; transition:opacity 0.15s; margin-left:auto; flex-shrink:0; line-height:1.2; }
        .urge-entry:hover .urge-delete { opacity:0.4; }
        .urge-delete:hover { opacity:1 !important; color:var(--danger); }
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
          const tags = tagsOf(u);
          return (
            <div key={u.id} className="urge-entry">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: 'var(--warning)', width: 20, flexShrink: 0 }}>{u.intensity}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.note || 'No note'}</div>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {tags.map(t => (
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
