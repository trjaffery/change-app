'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, NotebookPen, Dumbbell, HeartPulse, Wallet, Brain, type LucideIcon } from 'lucide-react';

/**
 * Hybrid navigation.
 *
 * - Mobile (≤ 640px): floating pill bar hovering ~12px above the safe area,
 *   with each active tab wearing its section accent color.
 * - Desktop (> 640px): a wider collapsed rail (labels peek in on hover),
 *   active section shown as a full-height left bar in that section's color.
 */

type SectionKey = 'home' | 'diary' | 'gym' | 'recovery' | 'finance' | 'coach';
interface NavItem { href: string; Icon: LucideIcon; label: string; section: SectionKey }

const NAV: NavItem[] = [
  { href: '/',         Icon: House,        label: 'Home',     section: 'home' },
  { href: '/diary',    Icon: NotebookPen,  label: 'Diary',    section: 'diary' },
  { href: '/gym',      Icon: Dumbbell,     label: 'Gym',      section: 'gym' },
  { href: '/recovery', Icon: HeartPulse,   label: 'Recovery', section: 'recovery' },
  { href: '/finance',  Icon: Wallet,       label: 'Finance',  section: 'finance' },
  { href: '/coach',    Icon: Brain,        label: 'Coach',    section: 'coach' },
];

export default function Sidebar() {
  const path = usePathname();

  const activeSection = NAV.find(n => n.href === path)?.section;
  const activeAccent  = activeSection ? `var(--accent-${activeSection})` : 'var(--success)';
  const activeGlow    = activeSection ? `var(--accent-${activeSection}-glow)` : 'var(--accent-home-glow)';

  return (
    <>
      <style>{`
        .nav {
          position: fixed; z-index: 100;
          /* Promote to its own compositor layer — without this, iOS Safari
             tears the bar mid-scroll when combined with backdrop-filter. */
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          will-change: transform;
        }

        /* ── Desktop: wider rail, expands on hover ─────────────────────── */
        .nav-desktop {
          left: 0; top: 0; bottom: 0;
          width: var(--sidebar-w);
          border-right: 1px solid var(--border-subtle);
          background: rgba(5,5,6,0.72);
          backdrop-filter: blur(22px) saturate(1.2);
          -webkit-backdrop-filter: blur(22px) saturate(1.2);
          display: flex; flex-direction: column;
          padding: 24px 10px 20px;
          overflow: hidden;
          transition: width var(--dur-base) var(--ease-out);
          /* Own compositor layer — combined backdrop-filter + border-radius
             on the child pill fools iOS Safari into tearing without this. */
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          will-change: transform;
        }
        .nav-desktop:hover { width: var(--sidebar-w-hover); }

        .nav-brand {
          display: flex; align-items: center; gap: 12px;
          padding: 0 12px; margin-bottom: 36px;
          font-family: var(--font-sans);
          font-weight: 600; letter-spacing: -0.02em;
          font-size: 17px; color: var(--text-primary);
          white-space: nowrap; overflow: hidden;
        }
        .nav-brand-glyph {
          color: var(--accent-home); flex-shrink: 0; width: 40px; height: 40px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: var(--r-3);
          background: var(--accent-home-glow);
          line-height: 0;
        }
        .nav-brand-text {
          opacity: 0; transform: translateX(-4px);
          transition: opacity var(--dur-base) ease 60ms, transform var(--dur-base) ease 60ms;
        }
        .nav-desktop:hover .nav-brand-text { opacity: 1; transform: translateX(0); }

        .nav-list { display: flex; flex-direction: column; gap: 4px; }
        .nav-item {
          position: relative;
          display: flex; align-items: center; gap: 14px;
          padding: 12px 12px; border-radius: var(--r-3);
          text-decoration: none; color: var(--text-tertiary);
          white-space: nowrap; overflow: hidden;
          transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
        }
        .nav-item:hover { background: rgba(255,255,255,0.04); color: var(--text-secondary); }
        .nav-item.active { color: var(--text-primary); }
        .nav-item.active::before {
          content: '';
          position: absolute; left: -10px; top: 8px; bottom: 8px;
          width: 3px; border-radius: 2px;
          background: var(--nav-active-color, var(--success));
          box-shadow: 0 0 14px var(--nav-active-glow, rgba(107,227,164,0.55));
        }
        .nav-glyph {
          flex-shrink: 0; width: 40px; height: 40px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: var(--r-3);
          line-height: 0;
          transition: background var(--dur-fast) var(--ease-out);
        }
        .nav-item.active .nav-glyph {
          color: var(--nav-active-color, var(--success));
          background: var(--nav-active-glow, rgba(107,227,164,0.14));
          filter: drop-shadow(0 0 10px var(--nav-active-glow, rgba(107,227,164,0.55)));
        }
        .nav-label {
          font-size: var(--text-body); font-weight: 600; letter-spacing: -0.005em;
          opacity: 0; transform: translateX(-4px);
          transition: opacity var(--dur-base) ease 60ms, transform var(--dur-base) ease 60ms;
        }
        .nav-desktop:hover .nav-label { opacity: 1; transform: translateX(0); }

        /* ── Mobile: floating pill above the safe-area ─────────────────── */
        .nav-mobile { display: none; }

        @media (max-width: 640px) {
          .nav-desktop { display: none; }

          .nav-mobile {
            display: flex;
            left: 12px; right: 12px;
            bottom: calc(env(safe-area-inset-bottom) + 12px);
            height: var(--nav-h);
            border-radius: var(--r-4);
            background: rgba(12,12,14,0.86);
            border: 1px solid var(--border-quiet);
            backdrop-filter: blur(24px) saturate(1.3);
            -webkit-backdrop-filter: blur(24px) saturate(1.3);
            box-shadow: var(--elev-2);
            padding: 6px;
            /* Own compositor layer + paint isolation — iOS Safari otherwise
               tears the pill mid-scroll (the "nav shows in the middle of the
               page" glitch). translateZ alone isn't always enough with the
               border-radius + backdrop-filter combo, so 'isolation' seals it. */
            transform: translateZ(0);
            -webkit-transform: translateZ(0);
            will-change: transform;
            isolation: isolate;
            contain: layout paint style;
          }
          .nav-mobile-list {
            display: flex; flex: 1; align-items: stretch; justify-content: space-between;
          }
          .nav-tab {
            position: relative;
            flex: 1;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 3px;
            text-decoration: none;
            color: var(--text-tertiary);
            border-radius: var(--r-3);
            transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
            min-height: 44px;
          }
          .nav-tab:active { color: var(--text-secondary); }
          .nav-tab.active {
            color: var(--nav-active-color, var(--success));
            background: var(--nav-active-glow, rgba(107,227,164,0.14));
          }
          .nav-tab.active .nav-tab-glyph {
            color: var(--nav-active-color, var(--success));
            filter: drop-shadow(0 0 10px var(--nav-active-glow, rgba(107,227,164,0.6)));
          }
          .nav-tab-glyph {
            display: inline-flex; align-items: center; justify-content: center;
            line-height: 0;
            transition: color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
          }
          .nav-tab:active .nav-tab-glyph { transform: scale(0.9); }
          .nav-tab-label {
            font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
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
          {NAV.map(({ href, Icon, label, section }) => {
            const isActive = path === href;
            const styleVars = isActive
              ? { ['--nav-active-color' as string]: activeAccent, ['--nav-active-glow' as string]: activeGlow }
              : undefined;
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                data-section={section}
                style={styleVars}
              >
                <span className="nav-glyph"><Icon size={20} strokeWidth={1.75} /></span>
                <span className="nav-label">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile */}
      <nav className="nav nav-mobile" aria-label="Primary">
        <div className="nav-mobile-list">
          {NAV.map(({ href, Icon, label, section }) => {
            const isActive = path === href;
            const styleVars = isActive
              ? { ['--nav-active-color' as string]: activeAccent, ['--nav-active-glow' as string]: activeGlow }
              : undefined;
            return (
              <Link
                key={href}
                href={href}
                className={`nav-tab${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                data-section={section}
                style={styleVars}
              >
                <span className="nav-tab-glyph"><Icon size={22} strokeWidth={1.75} /></span>
                <span className="nav-tab-label">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
