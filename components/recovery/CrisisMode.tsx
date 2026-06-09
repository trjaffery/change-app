'use client';
import { useCallback, useEffect, useState } from 'react';
import { Waves, FastForward, NotebookPen } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';

/**
 * Crisis mode — single-screen flow for when an urge is hot and decision-making
 * is impaired. Built to require minimum reading/thinking from the user:
 *   • visible breathing circle
 *   • HALT 4-toggle check (just tap what's true)
 *   • 3 big action buttons
 *   • the user's own "why" rendered serif italic as a calmness anchor
 */

interface Plan { why: string }

const HALT_LABELS: { code: string; label: string }[] = [
  { code: 'H', label: 'Hungry' },
  { code: 'A', label: 'Angry' },
  { code: 'L', label: 'Lonely' },
  { code: 'T', label: 'Tired' },
];

export default function CrisisMode({
  open,
  onClose,
  onStartSurf,
  onOpenPlayTape,
  onOpenLogUrge,
}: {
  open: boolean;
  onClose: () => void;
  onStartSurf: () => void;
  onOpenPlayTape: () => void;
  onOpenLogUrge: () => void;
}) {
  const [halt, setHalt] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Plan>({ why: '' });

  const loadPlan = useCallback(async () => {
    try {
      const res = await fetch('/api/recovery/rp-plan');
      const data = await res.json() as Plan;
      setPlan({ why: data.why ?? '' });
    } catch { /* leave empty */ }
  }, []);

  useEffect(() => {
    if (open) {
      setHalt(new Set());
      loadPlan();
    }
  }, [open, loadPlan]);

  function toggleHalt(code: string) {
    setHalt(prev => {
      const n = new Set(prev);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  }

  function pickAction(action: () => void) {
    onClose();
    // Defer so the closing animation gets a chance and we don't double-portal
    setTimeout(action, 220);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Right now">
      <style>{`
        .cm-breathe {
          width: 120px; height: 120px;
          border-radius: 50%;
          margin: 4px auto 18px;
          background: radial-gradient(circle, rgba(107,227,164,0.18) 0%, rgba(107,227,164,0.03) 70%);
          border: 1.5px solid rgba(107,227,164,0.4);
          animation: cm-breathe 19s ease-in-out infinite;
        }
        @keyframes cm-breathe {
          0%   { transform: scale(0.7); }
          21%  { transform: scale(1.0); }
          58%  { transform: scale(1.0); }
          100% { transform: scale(0.7); }
        }
        .cm-section { margin-bottom: 18px; }
        .cm-section-label {
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 8px;
        }
        .cm-halt-row { display: flex; gap: 6px; }
        .cm-halt-pill {
          flex: 1 1 0; min-height: 44px;
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-tertiary);
          font-family: var(--font-mono); font-size: 12px;
          font-weight: 700; letter-spacing: 0.06em;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: all 160ms ease;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 4px;
        }
        .cm-halt-pill .code { font-size: 16px; font-weight: 800; line-height: 1; }
        .cm-halt-pill .label { font-size: 9px; opacity: 0.7; margin-top: 2px; }
        .cm-halt-pill.on {
          background: rgba(242,192,99,0.14);
          border-color: rgba(242,192,99,0.5);
          color: var(--warning);
        }

        .cm-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .cm-action {
          background: rgba(107,227,164,0.06);
          border: 1px solid rgba(107,227,164,0.22);
          color: var(--text-primary);
          border-radius: 12px;
          padding: 14px 8px;
          font-family: var(--font-sans); font-size: 12px; font-weight: 600;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          line-height: 1.25;
          min-height: 84px;
          transition: background 160ms ease;
        }
        .cm-action:hover { background: rgba(107,227,164,0.1); }
        .cm-action svg { color: var(--success); }

        .cm-why {
          margin-top: 8px;
          padding: 14px 16px;
          border-radius: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-secondary);
          text-align: center;
        }
      `}</style>

      <div className="cm-breathe" aria-hidden />
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 18 }}>
        Breathe with the circle. 4 in · hold 7 · 8 out.
      </div>

      <div className="cm-section">
        <div className="cm-section-label">HALT — what&apos;s true right now</div>
        <div className="cm-halt-row">
          {HALT_LABELS.map(h => {
            const on = halt.has(h.code);
            return (
              <button key={h.code} className={`cm-halt-pill${on ? ' on' : ''}`} onClick={() => toggleHalt(h.code)}>
                <span className="code">{h.code}</span>
                <span className="label">{h.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cm-section">
        <div className="cm-section-label">Move</div>
        <div className="cm-actions">
          <button className="cm-action" onClick={() => pickAction(onStartSurf)}>
            <Waves size={20} strokeWidth={1.75} />
            <span>Surf the urge</span>
          </button>
          <button className="cm-action" onClick={() => pickAction(onOpenPlayTape)}>
            <FastForward size={20} strokeWidth={1.75} />
            <span>Play it forward</span>
          </button>
          <button className="cm-action" onClick={() => pickAction(onOpenLogUrge)}>
            <NotebookPen size={20} strokeWidth={1.75} />
            <span>Log this urge</span>
          </button>
        </div>
      </div>

      {plan.why?.trim() && (
        <div className="cm-section" style={{ marginBottom: 4 }}>
          <div className="cm-section-label">Why</div>
          <div className="cm-why">{plan.why}</div>
        </div>
      )}
    </BottomSheet>
  );
}
