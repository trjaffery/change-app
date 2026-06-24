'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';

/**
 * Floating gear, fixed top-right. Available across every page so Settings is
 * always one tap away without crowding the bottom nav.
 *
 * Hidden when already on /settings — the button would just point at the page
 * the user is looking at, which is noise.
 */
export default function SettingsButton() {
  const path = usePathname();
  const active = path === '/settings';

  return (
    <>
      <style>{`
        .settings-fab {
          position: fixed; z-index: 90;
          top: max(env(safe-area-inset-top), 14px);
          right: max(env(safe-area-inset-right), 14px);
          width: 38px; height: 38px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 999px;
          background: rgba(5,5,6,0.6);
          backdrop-filter: blur(18px) saturate(1.2);
          -webkit-backdrop-filter: blur(18px) saturate(1.2);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-secondary);
          text-decoration: none;
          transition: color 160ms ease, background 160ms ease, transform 160ms ease;
          -webkit-tap-highlight-color: transparent;
          /* Force own compositor layer so iOS Safari doesn't tear the
             backdrop-blurred FAB during momentum scroll. */
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          will-change: transform;
        }
        .settings-fab:hover {
          color: var(--text-primary);
          background: rgba(5,5,6,0.78);
        }
        .settings-fab:active { transform: translateZ(0) scale(0.95); }
        /* On desktop the sidebar already exists; offset slightly so the gear
           doesn't sit flush against the top-right where window controls are. */
        @media (min-width: 641px) {
          .settings-fab { top: 18px; right: 18px; width: 36px; height: 36px; }
        }
      `}</style>
      {!active && (
        <Link href="/settings" className="settings-fab" aria-label="Settings">
          <Settings size={17} strokeWidth={1.75} />
        </Link>
      )}
    </>
  );
}
