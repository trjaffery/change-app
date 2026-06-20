'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, NotebookPen, Dumbbell, HeartPulse, Wallet, Brain, type LucideIcon } from 'lucide-react';

/**
 * Hybrid navigation.
 *
 * - Mobile (≤ 640px): bottom tab bar, anchored to the home indicator via
 *   env(safe-area-inset-bottom). Icon + small label, full tap target.
 * - Desktop (> 640px): collapsed rail (icon only) that expands on hover.
 */

interface NavItem { href: string; Icon: LucideIcon; label: string }

const NAV: NavItem[] = [
  { href: '/',         Icon: House,        label: 'Home' },
  { href: '/diary',    Icon: NotebookPen,  label: 'Diary' },
  { href: '/gym',      Icon: Dumbbell,     label: 'Gym' },
  { href: '/recovery', Icon: HeartPulse,   label: 'Recovery' },
  { href: '/finance',  Icon: Wallet,       label: 'Finance' },
  { href: '/coach',    Icon: Brain,        label: 'Coach' },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <>
      <style>{`
        .nav {
          position: fixed; z-index: 100;
          backdrop-filter: blur(22px) saturate(1.2);
          -webkit-backdrop-filter: blur(22px) saturate(1.2);
          background: rgba(5,5,6,0.78);
        }

        /* ── Desktop: collapsed rail, expands on hover ─────────────────── */
        .nav-desktop {
          left: 0; top: 0; bottom: 0;
          width: var(--sidebar-w);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex; flex-direction: column;
          padding: 22px 8px 18px;
          overflow: hidden;
          transition: width 220ms cubic-bezier(0.22,1,0.36,1);
        }
        .nav-desktop:hover { width: var(--sidebar-w-hover); }

        .nav-brand {
          display: flex; align-items: center; gap: 12px;
          padding: 0 10px; margin-bottom: 32px;
          font-family: var(--font-serif); font-style: italic; font-weight: 400;
          font-size: 20px; color: var(--text-primary);
          white-space: nowrap; overflow: hidden;
        }
        .nav-brand-glyph {
          color: var(--success); flex-shrink: 0; width: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          line-height: 0;
        }
        .nav-brand-text {
          opacity: 0; transform: translateX(-4px);
          transition: opacity 200ms ease 60ms, transform 200ms ease 60ms;
        }
        .nav-desktop:hover .nav-brand-text { opacity: 1; transform: translateX(0); }

        .nav-list { display: flex; flex-direction: column; gap: 2px; }
        .nav-item {
          position: relative;
          display: flex; align-items: center; gap: 14px;
          padding: 11px 10px; border-radius: 11px;
          text-decoration: none; color: var(--text-tertiary);
          white-space: nowrap; overflow: hidden;
          transition: background 160ms ease, color 160ms ease;
        }
        .nav-item:hover { background: rgba(255,255,255,0.05); color: var(--text-secondary); }
        .nav-item.active { color: var(--text-primary); }
        .nav-item.active::before {
          content: '';
          position: absolute; left: -8px; top: 50%; transform: translateY(-50%);
          width: 3px; height: 18px; border-radius: 2px;
          background: var(--success);
          box-shadow: 0 0 12px rgba(107,227,164,0.6);
        }
        .nav-glyph {
          flex-shrink: 0; width: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          line-height: 0;
        }
        .nav-item.active .nav-glyph {
          color: var(--success);
          filter: drop-shadow(0 0 10px rgba(107,227,164,0.5));
        }
        .nav-label {
          font-size: 13px; font-weight: 600; letter-spacing: -0.005em;
          opacity: 0; transform: translateX(-4px);
          transition: opacity 200ms ease 60ms, transform 200ms ease 60ms;
        }
        .nav-desktop:hover .nav-label { opacity: 1; transform: translateX(0); }

        /* ── Mobile: bottom tab bar ────────────────────────────────────── */
        .nav-mobile { display: none; }

        @media (max-width: 640px) {
          .nav-desktop { display: none; }

          .nav-mobile {
            display: flex;
            left: 0; right: 0; bottom: 0;
            height: calc(var(--nav-h) + env(safe-area-inset-bottom));
            padding-bottom: env(safe-area-inset-bottom);
            border-top: 1px solid rgba(255,255,255,0.06);
            background: rgba(5,5,6,0.85);
          }
          .nav-mobile-list {
            display: flex; flex: 1; align-items: stretch;
          }
          .nav-tab {
            position: relative;
            flex: 1;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 4px;
            text-decoration: none;
            color: var(--text-tertiary);
            transition: color 160ms ease;
            min-height: var(--tap);
          }
          .nav-tab:active { color: var(--text-secondary); }
          .nav-tab.active { color: var(--text-primary); }
          .nav-tab.active .nav-tab-glyph {
            color: var(--success);
            filter: drop-shadow(0 0 10px rgba(107,227,164,0.5));
          }
          /* Active indicator pip at the top of the tab */
          .nav-tab.active::before {
            content: '';
            position: absolute; top: 0; left: 50%; transform: translateX(-50%);
            width: 26px; height: 2px;
            background: var(--success);
            border-radius: 0 0 3px 3px;
            box-shadow: 0 0 10px rgba(107,227,164,0.55);
          }
          .nav-tab-glyph {
            display: inline-flex; align-items: center; justify-content: center;
            line-height: 0;
            transition: color 160ms ease, filter 160ms ease, transform 160ms ease;
          }
          .nav-tab:active .nav-tab-glyph { transform: scale(0.92); }
          .nav-tab-label {
            font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
            text-transform: uppercase;
          }
        }
      `}</style>

      {/* Desktop */}
      <nav className="nav nav-desktop" aria-label="Primary">
        <div className="nav-brand">
          <span className="nav-brand-glyph"><HeartPulse size={18} strokeWidth={1.75} /></span>
          <span className="nav-brand-text">Change</span>
        </div>
        <div className="nav-list">
          {NAV.map(({ href, Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item${path === href ? ' active' : ''}`}
              aria-current={path === href ? 'page' : undefined}
            >
              <span className="nav-glyph"><Icon size={20} strokeWidth={1.75} /></span>
              <span className="nav-label">{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile */}
      <nav className="nav nav-mobile" aria-label="Primary">
        <div className="nav-mobile-list">
          {NAV.map(({ href, Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-tab${path === href ? ' active' : ''}`}
              aria-current={path === href ? 'page' : undefined}
            >
              <span className="nav-tab-glyph"><Icon size={22} strokeWidth={1.75} /></span>
              <span className="nav-tab-label">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
