'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, FastForward, Eye, Snowflake, ChevronRight } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';

/**
 * Crisis mode — a 5-phase walkthrough for when an urge is hot. The user is
 * walked through rate-in → HALT-with-prescription → pick a tool → anchor (why)
 * → rate-out + "I made it". Tools include an in-sheet 5-4-3-2-1 grounding and
 * TIPP cold-reset; the existing "Play it forward" route
 * also live here. The "I made it" exit logs to recovery_urges so future
 * patterns can surface "you survived 4 of 4 crisis opens this month".
 */

type Phase = 0 | 1 | 2 | 3 | 4;
type SubTool = null | 'grounding' | 'cold';

interface Plan { why: string }
interface PatternsCache { insights: { crisis_line?: string } | null }

const HALT_LABELS: { code: string; label: string; action: string }[] = [
  { code: 'H', label: 'Hungry', action: 'Eat or drink something now.' },
  { code: 'A', label: 'Angry', action: 'Cold water on hands for 30 seconds.' },
  { code: 'L', label: 'Lonely', action: 'Open Messages and text one person.' },
  { code: 'T', label: 'Tired', action: 'Lie down with eyes closed for 5 minutes.' },
];

const GROUNDING_STEPS = [
  { n: 5, prompt: 'things you can see' },
  { n: 4, prompt: 'things you can hear' },
  { n: 3, prompt: 'things you can feel' },
  { n: 2, prompt: 'things you can smell' },
  { n: 1, prompt: 'thing you can taste' },
];

const COLD_SECONDS = 30;

export default function CrisisMode({
  open,
  onClose,
  onOpenPlayTape,
  onOpenLogUrge,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPlayTape: () => void;
  onOpenLogUrge: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(0);
  const [subTool, setSubTool] = useState<SubTool>(null);
  const [intensityIn, setIntensityIn] = useState(5);
  const [intensityOut, setIntensityOut] = useState(5);
  const [halt, setHalt] = useState<Set<string>>(new Set());
  const [why, setWhy] = useState('');
  const [crisisLine, setCrisisLine] = useState('');
  const [logging, setLogging] = useState(false);

  // Reset and load contextual data each time the sheet is reopened.
  useEffect(() => {
    if (!open) return;
    setPhase(0); setSubTool(null);
    setIntensityIn(5); setIntensityOut(5);
    setHalt(new Set());
    (async () => {
      try {
        const [planRes, patternsRes] = await Promise.all([
          fetch('/api/recovery/rp-plan'),
          fetch('/api/ai/recovery-patterns'),
        ]);
        const plan = await planRes.json() as Plan;
        setWhy(plan.why ?? '');
        const pat = await patternsRes.json() as PatternsCache;
        setCrisisLine(pat.insights?.crisis_line ?? '');
      } catch { /* leave defaults */ }
    })();
  }, [open]);

  function toggleHalt(code: string) {
    setHalt(prev => {
      const n = new Set(prev);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  }

  function advance() {
    setSubTool(null);
    setPhase(p => {
      // Skip Why phase if no why text is set.
      if (p === 2) return (why.trim() ? 3 : 4) as Phase;
      if (p === 3) return 4;
      return Math.min(4, p + 1) as Phase;
    });
  }
  function back() {
    setSubTool(null);
    setPhase(p => {
      if (p === 4 && !why.trim()) return 2;
      return Math.max(0, p - 1) as Phase;
    });
  }

  function pickExternal(action: () => void) {
    onClose();
    setTimeout(action, 220);
  }

  // Carry-over default for the exit slider: start at the entry value so the
  // user only moves it if they actually feel different.
  useEffect(() => { if (phase === 4) setIntensityOut(intensityIn); }, [phase, intensityIn]);

  async function logSurvived() {
    if (logging) return;
    setLogging(true);
    try {
      // Expand HALT codes to their human labels so they merge with the rest of
      // the user's tag vocabulary in the unified `tags` column.
      const haltLabel: Record<string, string> = { H: 'Hungry', A: 'Angry', L: 'Lonely', T: 'Tired' };
      const tags = [...halt].map(c => haltLabel[c] ?? c).filter(Boolean);
      await fetch('/api/recovery/urges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intensity: Math.max(1, Math.min(5, Math.round(intensityOut / 2))),
          note: `Started ${intensityIn}/10 → ended ${intensityOut}/10`,
          tags,
          is_crisis: true,
        }),
      });
    } finally {
      setLogging(false);
      onClose();
    }
  }

  const title = `Right now · ${phase + 1}/5`;

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <style>{`
        .cm-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; min-height: 24px; }
        .cm-back {
          background: transparent; border: none; padding: 4px 6px 4px 0;
          color: var(--text-tertiary); cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em;
          text-transform: uppercase;
          -webkit-tap-highlight-color: transparent;
        }
        .cm-back:hover { color: var(--text-secondary); }
        .cm-line {
          margin-left: auto;
          font-family: var(--font-sans);
          font-size: 12px; color: var(--text-tertiary);
          text-align: right; line-height: 1.4;
          max-width: 65%;
        }
        .cm-phase-title {
          font-size: 18px; font-weight: 700; color: var(--text-primary);
          margin-bottom: 6px; line-height: 1.3;
        }
        .cm-phase-sub {
          font-size: 12px; color: var(--text-tertiary);
          margin-bottom: 18px; line-height: 1.5;
        }

        .cm-slider-wrap { padding: 22px 4px 8px; }
        .cm-slider-value {
          font-family: var(--font-mono); font-size: 44px; font-weight: 800;
          color: var(--warning); text-align: center; line-height: 1;
          margin-bottom: 14px;
        }
        .cm-slider-value .total {
          font-size: 16px; color: var(--text-tertiary); margin-left: 4px; font-weight: 600;
        }
        .cm-slider {
          width: 100%; accent-color: var(--warning); cursor: pointer;
        }
        .cm-slider-ticks {
          display: flex; justify-content: space-between;
          font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);
          margin-top: 6px; padding: 0 2px;
        }

        .cm-halt-row { display: flex; gap: 6px; margin-bottom: 12px; }
        .cm-halt-pill {
          flex: 1 1 0; min-height: 56px;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-tertiary);
          font-family: var(--font-sans); font-size: 12px; font-weight: 700;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: all 160ms ease;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 4px;
        }
        .cm-halt-pill .code { font-family: var(--font-mono); font-size: 16px; font-weight: 800; line-height: 1; }
        .cm-halt-pill .label { font-size: 10px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; }
        .cm-halt-pill.on {
          background: rgba(242,192,99,0.14);
          border-color: rgba(242,192,99,0.5);
          color: var(--warning);
        }
        .cm-prescriptions { display: flex; flex-direction: column; gap: 6px; }
        .cm-prescription {
          padding: 10px 12px; border-radius: 10px;
          background: rgba(242,192,99,0.06);
          border: 1px solid rgba(242,192,99,0.18);
          font-size: 13px; color: var(--text-secondary);
          line-height: 1.45;
          display: flex; align-items: baseline; gap: 8px;
        }
        .cm-prescription .label {
          font-family: var(--font-mono); font-size: 10px; color: var(--warning);
          font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          flex-shrink: 0;
        }

        .cm-tools { display: flex; flex-direction: column; gap: 8px; }
        .cm-tool {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 14px;
          border-radius: 12px;
          background: rgba(107,227,164,0.05);
          border: 1px solid rgba(107,227,164,0.2);
          color: var(--text-primary);
          font-family: var(--font-sans); font-size: 14px; font-weight: 600;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background 160ms ease;
          text-align: left;
        }
        .cm-tool:hover { background: rgba(107,227,164,0.1); }
        .cm-tool svg.icon { color: var(--success); flex-shrink: 0; }
        .cm-tool svg.chev { color: var(--text-tertiary); margin-left: auto; flex-shrink: 0; }
        .cm-tool .desc {
          display: block; font-size: 11px; color: var(--text-tertiary);
          font-weight: 500; margin-top: 2px;
        }

        .cm-why {
          margin-top: 8px;
          padding: 18px 18px;
          border-radius: 14px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          font-family: var(--font-sans);
          font-style: italic;
          font-size: 16px;
          line-height: 1.6;
          color: var(--text-secondary);
          text-align: center;
        }

        .cm-cta-row { display: flex; gap: 10px; margin-top: 22px; }
        .cm-cta-primary {
          flex: 1; padding: 14px 18px;
          background: var(--success); color: #082319;
          border: none; border-radius: 12px;
          font-family: var(--font-sans); font-size: 14px; font-weight: 800;
          letter-spacing: 0.02em; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: filter 160ms ease;
          min-height: 48px;
        }
        .cm-cta-primary:hover { filter: brightness(1.08); }
        .cm-cta-secondary {
          padding: 14px 18px;
          background: transparent; color: var(--text-tertiary);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          font-family: var(--font-sans); font-size: 13px; font-weight: 600;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          min-height: 48px;
        }
        .cm-skip {
          background: transparent; border: none; color: var(--text-tertiary);
          font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
          text-transform: uppercase; cursor: pointer; padding: 8px;
          margin: 4px auto 0; display: block;
        }
        .cm-skip:hover { color: var(--text-secondary); }

        /* Grounding sub-screen */
        .cm-ground-card {
          padding: 28px 20px;
          border-radius: 14px;
          background: rgba(120,180,255,0.04);
          border: 1px solid rgba(120,180,255,0.18);
          text-align: center;
        }
        .cm-ground-n {
          font-family: var(--font-mono); font-size: 72px; font-weight: 800;
          color: #78B4FF; line-height: 1; margin-bottom: 10px;
        }
        .cm-ground-prompt {
          font-size: 16px; color: var(--text-primary);
          line-height: 1.45; margin-bottom: 22px;
        }
        .cm-ground-step {
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary); letter-spacing: 0.12em;
          margin-bottom: 14px;
        }

        /* Cold reset sub-screen */
        .cm-cold-card {
          padding: 28px 20px;
          border-radius: 14px;
          background: rgba(120,180,255,0.04);
          border: 1px solid rgba(120,180,255,0.18);
          text-align: center;
        }
        .cm-cold-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
        .cm-cold-sub { font-size: 12px; color: var(--text-tertiary); margin-bottom: 22px; line-height: 1.5; }
        .cm-cold-timer {
          font-family: var(--font-mono); font-size: 72px; font-weight: 800;
          color: #78B4FF; line-height: 1; margin-bottom: 4px;
        }
        .cm-cold-unit { font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary); letter-spacing: 0.14em; margin-bottom: 22px; }
      `}</style>

      {/* Header row: back arrow + AI calming line */}
      <div className="cm-head">
        {phase > 0 && subTool === null && (
          <button className="cm-back" onClick={back}><ArrowLeft size={12} strokeWidth={2.25} /> Back</button>
        )}
        {subTool !== null && (
          <button className="cm-back" onClick={() => setSubTool(null)}><ArrowLeft size={12} strokeWidth={2.25} /> Back</button>
        )}
        {crisisLine && phase === 0 && subTool === null && (
          <div className="cm-line">{crisisLine}</div>
        )}
      </div>

      {subTool === 'grounding' && <GroundingScreen onDone={() => { setSubTool(null); advance(); }} />}
      {subTool === 'cold' && <ColdResetScreen onDone={() => { setSubTool(null); advance(); }} />}

      {subTool === null && phase === 0 && (
        <>
          <div className="cm-phase-title">How strong is the urge right now?</div>
          <div className="cm-phase-sub">Slide to roughly where it is. You don&apos;t need to be exact.</div>
          <div className="cm-slider-wrap">
            <div className="cm-slider-value">{intensityIn}<span className="total">/10</span></div>
            <input className="cm-slider" type="range" min={1} max={10} value={intensityIn} onChange={e => setIntensityIn(Number(e.target.value))} />
            <div className="cm-slider-ticks"><span>1</span><span>5</span><span>10</span></div>
          </div>
          <div className="cm-cta-row">
            <button className="cm-cta-primary" onClick={advance}>Continue</button>
          </div>
        </>
      )}

      {subTool === null && phase === 1 && (
        <>
          <div className="cm-phase-title">What&apos;s true right now?</div>
          <div className="cm-phase-sub">Tap any that fit. We&apos;ll give you a small thing to do.</div>
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
          <div className="cm-prescriptions">
            {HALT_LABELS.filter(h => halt.has(h.code)).map(h => (
              <div key={h.code} className="cm-prescription">
                <span className="label">{h.label}</span>
                <span>{h.action}</span>
              </div>
            ))}
          </div>
          <div className="cm-cta-row">
            <button className="cm-cta-primary" onClick={advance}>Continue</button>
          </div>
          <button className="cm-skip" onClick={advance}>Skip</button>
        </>
      )}

      {subTool === null && phase === 2 && (
        <>
          <div className="cm-phase-title">Pick one thing.</div>
          <div className="cm-phase-sub">Don&apos;t pick the best one. Just pick one.</div>
          <div className="cm-tools">
            <button className="cm-tool" onClick={() => setSubTool('grounding')}>
              <Eye size={20} strokeWidth={1.75} className="icon" />
              <span>5-4-3-2-1 grounding<span className="desc">Walk through your senses, ~60s.</span></span>
              <ChevronRight size={16} strokeWidth={2} className="chev" />
            </button>
            <button className="cm-tool" onClick={() => setSubTool('cold')}>
              <Snowflake size={20} strokeWidth={1.75} className="icon" />
              <span>Cold reset (30s)<span className="desc">Cold water on face / hold ice. Resets your nervous system.</span></span>
              <ChevronRight size={16} strokeWidth={2} className="chev" />
            </button>
            <button className="cm-tool" onClick={() => pickExternal(onOpenPlayTape)}>
              <FastForward size={20} strokeWidth={1.75} className="icon" />
              <span>Play it forward<span className="desc">Walk through the next 24 hours if you give in.</span></span>
              <ChevronRight size={16} strokeWidth={2} className="chev" />
            </button>
          </div>
          <button className="cm-skip" onClick={advance}>Skip</button>
        </>
      )}

      {subTool === null && phase === 3 && (
        <>
          <div className="cm-phase-title">Your why.</div>
          <div className="cm-phase-sub">Read it. Slowly. You wrote this for now.</div>
          <div className="cm-why">{why}</div>
          <div className="cm-cta-row">
            <button className="cm-cta-primary" onClick={advance}>Continue</button>
          </div>
        </>
      )}

      {subTool === null && phase === 4 && (
        <>
          <div className="cm-phase-title">How strong is it now?</div>
          <div className="cm-phase-sub">No wrong answer. Even one notch is progress.</div>
          <div className="cm-slider-wrap">
            <div className="cm-slider-value">{intensityOut}<span className="total">/10</span></div>
            <input className="cm-slider" type="range" min={1} max={10} value={intensityOut} onChange={e => setIntensityOut(Number(e.target.value))} />
            <div className="cm-slider-ticks"><span>1</span><span>5</span><span>10</span></div>
          </div>
          <div className="cm-cta-row">
            <button className="cm-cta-primary" onClick={logSurvived} disabled={logging}>
              {logging ? 'Logging…' : 'I made it'}
            </button>
            <button className="cm-cta-secondary" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

function GroundingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const cur = GROUNDING_STEPS[step];
  function next() {
    if (step + 1 >= GROUNDING_STEPS.length) onDone();
    else setStep(step + 1);
  }
  return (
    <>
      <div className="cm-ground-card">
        <div className="cm-ground-step">{step + 1} of {GROUNDING_STEPS.length}</div>
        <div className="cm-ground-n">{cur.n}</div>
        <div className="cm-ground-prompt">{cur.prompt}</div>
      </div>
      <div className="cm-cta-row">
        <button className="cm-cta-primary" onClick={next}>{step + 1 === GROUNDING_STEPS.length ? 'Done' : 'Next'}</button>
      </div>
    </>
  );
}

function ColdResetScreen({ onDone }: { onDone: () => void }) {
  const [remaining, setRemaining] = useState(COLD_SECONDS);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  function start() {
    if (running || remaining <= 0) return;
    setRunning(true);
    timerRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { stop(); return 0; }
        return r - 1;
      });
    }, 1000);
  }
  function reset() { stop(); setRemaining(COLD_SECONDS); }

  return (
    <>
      <div className="cm-cold-card">
        <div className="cm-cold-title">Cold reset</div>
        <div className="cm-cold-sub">Splash cold water on your face, or hold ice in your hand. Breathe slowly while the timer runs.</div>
        <div className="cm-cold-timer">{remaining}</div>
        <div className="cm-cold-unit">seconds</div>
        {!running && remaining === COLD_SECONDS && (
          <button className="cm-cta-primary" style={{ width: '100%' }} onClick={start}>Start 30s</button>
        )}
        {running && (
          <button className="cm-cta-secondary" style={{ width: '100%' }} onClick={stop}>Pause</button>
        )}
        {!running && remaining < COLD_SECONDS && remaining > 0 && (
          <div className="cm-cta-row" style={{ marginTop: 0 }}>
            <button className="cm-cta-primary" onClick={start}>Resume</button>
            <button className="cm-cta-secondary" onClick={reset}>Reset</button>
          </div>
        )}
        {remaining === 0 && (
          <button className="cm-cta-primary" style={{ width: '100%' }} onClick={onDone}>Done</button>
        )}
      </div>
      {remaining > 0 && (
        <div className="cm-cta-row">
          <button className="cm-cta-secondary" style={{ flex: 1 }} onClick={onDone}>Skip</button>
        </div>
      )}
    </>
  );
}
