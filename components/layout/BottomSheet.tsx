'use client';
import React, { useEffect } from 'react';

/**
 * iOS-style bottom sheet:
 *   - slides up from the bottom edge
 *   - drag-handle visible at the top
 *   - taps on backdrop close (unless `disableBackdropClose`)
 *   - Escape closes
 *   - body scroll is locked while open
 *
 * On desktop (≥ 641px) it falls back to a centered modal so it doesn't
 * feel weirdly anchored to the bottom of a giant viewport.
 */

export default function BottomSheet({
  open,
  onClose,
  children,
  title,
  disableBackdropClose,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  disableBackdropClose?: boolean;
}) {
  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="bs-backdrop"
      onClick={() => !disableBackdropClose && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <style>{`
        .bs-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          z-index: 300;
          display: flex; align-items: flex-end; justify-content: center;
          animation: bs-fade 220ms ease both;
        }
        @keyframes bs-fade { from { opacity: 0; } to { opacity: 1; } }

        .bs-sheet {
          width: 100%;
          max-width: 520px;
          background: #0E0E10;
          border: 1px solid rgba(255,255,255,0.07);
          border-bottom: none;
          border-radius: 18px 18px 0 0;
          padding:
            14px 18px
            calc(env(safe-area-inset-bottom) + 20px);
          box-shadow: 0 -16px 50px rgba(0,0,0,0.5);
          animation: bs-up 320ms cubic-bezier(0.22,1,0.36,1) both;
          max-height: 92svh;
          overflow-y: auto;
        }
        @keyframes bs-up {
          from { transform: translateY(28px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        .bs-handle {
          width: 38px; height: 4px;
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
          margin: 0 auto 14px;
        }

        .bs-title {
          font-size: 14px; font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
          letter-spacing: -0.005em;
        }

        @media (min-width: 641px) {
          .bs-backdrop { align-items: center; padding: 24px; }
          .bs-sheet {
            border-radius: 18px;
            border: 1px solid rgba(255,255,255,0.08);
            padding: 22px 22px 22px;
            animation: bs-pop 240ms cubic-bezier(0.22,1,0.36,1) both;
            max-height: 88vh;
          }
          @keyframes bs-pop {
            from { transform: translateY(6px) scale(0.985); opacity: 0; }
            to   { transform: translateY(0)   scale(1);     opacity: 1; }
          }
          .bs-handle { display: none; }
        }
      `}</style>

      <div className="bs-sheet" onClick={e => e.stopPropagation()}>
        <div className="bs-handle" aria-hidden />
        {title && <div className="bs-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
