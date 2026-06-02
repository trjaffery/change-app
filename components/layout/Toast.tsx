'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * App-wide toast system.
 *
 *   const toast = useToast();
 *   toast({ kind: 'success', message: 'Saved' });
 *   toast({ kind: 'error',   message: 'Failed', durationMs: 6000 });
 *   toast({ kind: 'warning', message: 'Deleted workout', undo: () => restore() });
 *
 * Toasts stack at the bottom of the viewport, slide up on enter, fade out on dismiss.
 * Auto-dismiss is paused when an undo action is present (waits for user decision).
 */

type Kind = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  kind?: Kind;
  message: string;
  durationMs?: number;
  undo?: () => void;
}

interface ActiveToast extends Required<Omit<ToastOptions, 'undo'>> {
  id: number;
  undo?: () => void;
}

const ToastContext = createContext<((opts: ToastOptions) => void) | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const DEFAULT_DURATION = 3800;
const UNDO_DURATION = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((opts: ToastOptions) => {
    const id = ++idRef.current;
    const next: ActiveToast = {
      id,
      kind: opts.kind ?? 'info',
      message: opts.message,
      durationMs: opts.durationMs ?? (opts.undo ? UNDO_DURATION : DEFAULT_DURATION),
      undo: opts.undo,
    };
    setToasts(prev => [...prev, next]);
    if (next.durationMs > 0) {
      setTimeout(() => dismiss(id), next.durationMs);
    }
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: ActiveToast[]; dismiss: (id: number) => void }) {
  return (
    <>
      <style>{`
        .toast-stack {
          position: fixed;
          left: 0; right: 0;
          bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 12px);
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 0 12px;
          pointer-events: none;
          z-index: 200;
        }
        @media (min-width: 641px) {
          .toast-stack {
            bottom: 24px;
            align-items: flex-end;
            padding-right: 24px;
          }
        }
        .toast {
          pointer-events: auto;
          display: flex; align-items: center; gap: 12px;
          min-width: 240px; max-width: 480px; width: fit-content;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(15,15,17,0.94);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(20px) saturate(1.25);
          -webkit-backdrop-filter: blur(20px) saturate(1.25);
          box-shadow: 0 16px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04);
          font-size: 14px; color: var(--text-primary);
          animation: toast-in 280ms cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .toast-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 10px currentColor; }
        .toast-dot.success { color: var(--success); background: var(--success); }
        .toast-dot.error   { color: var(--danger);  background: var(--danger);  }
        .toast-dot.warning { color: var(--warning); background: var(--warning); }
        .toast-dot.info    { color: var(--text-secondary); background: var(--text-secondary); box-shadow: none; }
        .toast-msg { flex: 1; line-height: 1.45; }
        .toast-undo {
          background: transparent; border: none; color: var(--success);
          font-family: var(--font-sans); font-weight: 700; font-size: 13px;
          cursor: pointer; padding: 4px 8px; border-radius: 6px;
          -webkit-tap-highlight-color: transparent;
          letter-spacing: -0.005em;
        }
        .toast-undo:hover { background: rgba(107,227,164,0.08); }
        .toast-close {
          background: transparent; border: none; color: var(--text-tertiary);
          font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 6px;
          -webkit-tap-highlight-color: transparent;
        }
        .toast-close:hover { color: var(--text-secondary); }
      `}</style>
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className="toast" role="status">
            <span className={`toast-dot ${t.kind}`} aria-hidden />
            <span className="toast-msg">{t.message}</span>
            {t.undo && (
              <button
                className="toast-undo"
                onClick={() => { t.undo!(); dismiss(t.id); }}
              >
                Undo
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </>
  );
}
