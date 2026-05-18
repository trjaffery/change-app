'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', icon: '⊙', label: 'Home' },
  { href: '/gym', icon: '◎', label: 'Gym' },
  { href: '/recovery', icon: '◈', label: 'Recovery' },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <>
      <style>{`
        .sidebar {
          position: fixed; left: 0; top: 0; bottom: 0; width: 60px;
          background: rgba(5,5,6,0.92); border-right: 1px solid rgba(255,255,255,0.05);
          display: flex; flex-direction: column; align-items: center;
          padding: 20px 0 16px; z-index: 100; overflow: hidden;
          transition: width 0.22s cubic-bezier(0.22,1,0.36,1);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        }
        .sidebar:hover { width: 200px; }
        .sidebar-logo {
          display: flex; align-items: center; gap: 10px;
          padding: 0 18px; margin-bottom: 28px;
          width: 100%; white-space: nowrap; overflow: hidden;
        }
        .sidebar-logo-icon { font-size: 16px; flex-shrink: 0; width: 24px; text-align: center; color: var(--text-secondary); }
        .sidebar-logo-text { font-size: 13px; font-weight: 700; color: var(--text-secondary); opacity: 0; transition: opacity 0.15s ease; }
        .sidebar:hover .sidebar-logo-text { opacity: 1; }
        .sidebar-nav { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 0 8px; }
        .sidebar-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px; border-radius: 10px; text-decoration: none;
          color: var(--text-tertiary); white-space: nowrap; overflow: hidden;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .sidebar-item:hover { background: rgba(255,255,255,0.06); color: var(--text-secondary); }
        .sidebar-item.active { background: rgba(255,255,255,0.08); color: var(--text-primary); }
        .sidebar-icon { font-size: 17px; flex-shrink: 0; width: 24px; text-align: center; }
        .sidebar-label { font-size: 13px; font-weight: 600; opacity: 0; transition: opacity 0.15s ease; }
        .sidebar:hover .sidebar-label { opacity: 1; }

        @media (max-width: 600px) {
          .sidebar {
            width: 100% !important;
            height: calc(60px + env(safe-area-inset-bottom));
            top: auto; bottom: 0;
            flex-direction: row;
            padding: 0 0 env(safe-area-inset-bottom);
            border-right: none;
            border-top: 1px solid rgba(255,255,255,0.06);
            align-items: stretch;
            justify-content: space-around;
            transition: none;
          }
          .sidebar-logo { display: none; }
          .sidebar-nav {
            flex-direction: row; padding: 0; gap: 0;
            width: 100%; align-items: stretch;
          }
          .sidebar-item {
            flex: 1; flex-direction: column; gap: 3px;
            padding: 10px 8px 8px; border-radius: 0;
            align-items: center; justify-content: center;
          }
          .sidebar-item.active { background: rgba(255,255,255,0.05); }
          .sidebar-label { opacity: 1; font-size: 10px; font-weight: 600; letter-spacing: 0.02em; }
          .sidebar-icon { font-size: 19px; width: auto; }
        }
      `}</style>
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">◈</span>
          <span className="sidebar-logo-text">Change</span>
        </div>
        <div className="sidebar-nav">
          {NAV.map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-item${path === href ? ' active' : ''}`}
            >
              <span className="sidebar-icon">{icon}</span>
              <span className="sidebar-label">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
