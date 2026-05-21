'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface Goal { id: string; text: string; done: boolean }
interface TickerItem { status: 'done' | 'pending' | 'empty'; text: string }

function glyph(s: string) { return s === 'done' ? '✓' : s === 'pending' ? '○' : '·'; }

export default function GoalTicker({ goals }: { goals: Goal[] }) {
  const [item, setItem] = useState<TickerItem>({ status: 'empty', text: 'Loading…' });
  const [meta, setMeta] = useState('0/0');
  const [entering, setEntering] = useState(false);
  const idxRef = useRef(0);

  const buildItems = useCallback((): TickerItem[] => {
    const total = goals.length, done = goals.filter(g => g.done).length;
    setMeta(`${done}/${total}`);
    if (total === 0) return [{ status: 'empty', text: 'No goals set for today — add one to get rolling.' }];
    if (done === total) return [{ status: 'done', text: '✓ All goals done — solid day.' }];
    return goals.filter(g => !g.done).map(g => ({ status: 'pending' as const, text: g.text }));
  }, [goals]);

  const advance = useCallback(() => {
    const items = buildItems();
    const next = items[idxRef.current % items.length];
    idxRef.current = (idxRef.current + 1) % items.length;
    setEntering(true);
    setItem(next);
    setTimeout(() => setEntering(false), 450);
  }, [buildItems]);

  useEffect(() => {
    idxRef.current = 0;
    advance();
  }, [goals]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(advance, 5000);
    return () => clearInterval(id);
  }, [advance]);

  return (
    <div style={{ marginBottom: 18 }}>
      <style>{`
        .ticker-wrap {
          display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-radius: 12px;
          background-image: linear-gradient(180deg,rgba(0,0,0,0.42),rgba(0,0,0,0.30)),
            repeating-linear-gradient(0deg,rgba(255,255,255,0.025) 0,rgba(255,255,255,0.025) 1px,transparent 1px,transparent 3px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
          position: relative; overflow: hidden;
        }
        .ticker-wrap::after {
          content:''; position:absolute; top:0; left:-40%; width:30%; height:100%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent);
          animation:sweep 8s ease-in-out infinite;
        }
        @keyframes sweep { 0%{left:-40%} 100%{left:110%} }
        .ticker-led-dot {
          display:block; width:7px; height:7px; border-radius:50%;
          background:#6BE3A4; box-shadow:0 0 8px rgba(107,227,164,0.7);
          animation:led-pulse 1.6s ease-in-out infinite;
        }
        @keyframes led-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(0.85)} }
        .ticker-row { display:flex; align-items:center; height:22px; gap:8px; font-family:var(--font-mono); font-size:12.5px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; width:100%; }
        .ticker-entering { animation:ticker-enter 0.45s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes ticker-enter { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
        .ticker-status-done { color:var(--success); }
        .ticker-status-pending { color:var(--text-tertiary); }
        .ticker-status-empty { color:var(--text-tertiary); }
        .ticker-meta { font-family:var(--font-mono); font-size:11px; font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:0.04em; color:var(--text-secondary); padding:3px 8px; border-radius:999px; background:rgba(255,255,255,0.04); white-space:nowrap; }
      `}</style>
      <div className="ticker-wrap" aria-live="polite" aria-atomic="true">
        <span style={{ display: 'flex', alignItems: 'center' }}><span className="ticker-led-dot" /></span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>GOALS</span>
        <div style={{ flex: 1, height: 22, position: 'relative', overflow: 'hidden' }}>
          <div className={`ticker-row${entering ? ' ticker-entering' : ''}`}>
            <span className={`ticker-status-${item.status}`}>{glyph(item.status)}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</span>
          </div>
        </div>
        <span className="ticker-meta">{meta}</span>
      </div>
    </div>
  );
}
