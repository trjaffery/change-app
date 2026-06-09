'use client';
import { useEffect, useRef, useState } from 'react';
import BottomSheet from '@/components/layout/BottomSheet';
import { useToast } from '@/components/layout/Toast';

/**
 * 20-minute urge-surfing timer with 4-7-8 breathing animation.
 *
 * Most urges peak and pass within 20-30 minutes. The user just has to outlast
 * the wave. The circle expands on inhale, holds, contracts on exhale —
 * matching the standard 4-7-8 breathing pattern (Andrew Weil / vagal-tone work).
 *
 * Checkpoint copy at 5/10/15 min nudges the user to keep going.
 */

const TOTAL_SECONDS = 20 * 60;
const CHECKPOINTS: { atSec: number; msg: string }[] = [
  { atSec: 5 * 60,  msg: 'first 5 mins. the wave is starting to crest.' },
  { atSec: 10 * 60, msg: 'halfway. it gets quieter from here.' },
  { atSec: 15 * 60, msg: '5 to go. the urge is almost spent.' },
];

function formatMMSS(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function UrgeSurfingTimer({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted?: (fullCompletion: boolean) => void;
}) {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastCheckpoint, setLastCheckpoint] = useState<number>(-1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  // Reset state every time the sheet opens fresh.
  useEffect(() => {
    if (open) {
      setRunning(false);
      setElapsed(0);
      setLastCheckpoint(-1);
      finishedRef.current = false;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open]);

  // Tick.
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= TOTAL_SECONDS) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          // Full completion
          finishedRef.current = true;
          void persistSurf(TOTAL_SECONDS, true);
          toast({ kind: 'success', message: '20 minutes surfed. the wave passed.' });
          onCompleted?.(true);
        }
        return next;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Surface checkpoint messages once each.
  useEffect(() => {
    const hit = CHECKPOINTS.findIndex(c => elapsed >= c.atSec);
    if (hit >= 0 && hit > lastCheckpoint && elapsed < TOTAL_SECONDS) {
      toast({ kind: 'info', message: CHECKPOINTS[hit].msg });
      setLastCheckpoint(hit);
    }
  }, [elapsed, lastCheckpoint, toast]);

  async function persistSurf(seconds: number, full: boolean) {
    try {
      await fetch('/api/recovery/urge-surfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_seconds: seconds, full_completion: full }),
      });
    } catch { /* silent — UI state already updated */ }
  }

  async function handleClose() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (running && !finishedRef.current && elapsed > 0) {
      await persistSurf(elapsed, false);
      toast({ kind: 'info', message: `${formatMMSS(elapsed)} surfed. counts as progress.` });
      onCompleted?.(false);
    }
    setRunning(false);
    onClose();
  }

  const remaining = TOTAL_SECONDS - elapsed;
  const done = elapsed >= TOTAL_SECONDS;

  return (
    <BottomSheet open={open} onClose={handleClose} title="Surf this urge">
      <style>{`
        /* 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s = 19s cycle */
        .surf-circle {
          width: 180px; height: 180px;
          border-radius: 50%;
          margin: 14px auto 22px;
          background: radial-gradient(circle, rgba(107,227,164,0.18) 0%, rgba(107,227,164,0.03) 70%);
          border: 1.5px solid rgba(107,227,164,0.35);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--success);
          letter-spacing: 0.18em; text-transform: uppercase;
          transform: scale(0.65);
          transition: transform 0.4s ease, color 0.4s ease;
        }
        .surf-circle.running { animation: surf-breathe 19s ease-in-out infinite; }
        @keyframes surf-breathe {
          0%   { transform: scale(0.65); }
          21%  { transform: scale(1.0); }   /* 4s inhale → expanded */
          58%  { transform: scale(1.0); }   /* hold 7s */
          100% { transform: scale(0.65); }  /* exhale 8s */
        }
        .surf-time {
          font-family: var(--font-mono);
          font-size: 44px; font-weight: 700;
          letter-spacing: -0.04em;
          text-align: center;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
          margin-bottom: 6px;
        }
        .surf-caption {
          text-align: center; color: var(--text-tertiary);
          font-size: 13px; line-height: 1.5;
          margin-bottom: 18px;
          max-width: 320px; margin-left: auto; margin-right: auto;
        }
        .surf-actions { display: flex; gap: 10px; justify-content: center; }
      `}</style>

      <div className={`surf-circle${running && !done ? ' running' : ''}`}>
        {running ? (done ? 'done' : 'breathe') : 'ready'}
      </div>

      <div className="surf-time">{formatMMSS(running ? remaining : TOTAL_SECONDS)}</div>
      <div className="surf-caption">
        {!running && 'The urge is a wave. It peaks and passes. Stay with the breath for 20 min — the wave will move through you.'}
        {running && !done && 'Inhale 4s · hold 7s · exhale 8s'}
        {done && 'You surfed the wave. The urge passed without you. That is the proof.'}
      </div>

      <div className="surf-actions">
        {!running && !done && (
          <button className="btn-primary" style={{ fontSize: 13, minWidth: 160 }} onClick={() => setRunning(true)}>
            Start
          </button>
        )}
        {running && !done && (
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={handleClose}>
            End early
          </button>
        )}
        {done && (
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
