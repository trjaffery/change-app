'use client';
import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import StreakCard from '@/components/recovery/StreakCard';
import UrgeLog from '@/components/recovery/UrgeLog';
import UrgePatterns from '@/components/recovery/UrgePatterns';
import RelapseLog from '@/components/recovery/RelapseLog';
import RelapsePreventionPlan from '@/components/recovery/RelapsePreventionPlan';
import PlayTheTape from '@/components/recovery/PlayTheTape';
import PageHeader from '@/components/layout/PageHeader';
import CrisisMode from '@/components/recovery/CrisisMode';

export default function RecoveryPage() {
  const [urgeRefreshKey, setUrgeRefreshKey] = useState(0);
  const [streakRefreshKey, setStreakRefreshKey] = useState(0);
  const [crisisOpen, setCrisisOpen] = useState(false);
  const [tapeOpen, setTapeOpen] = useState(false);

  function openTape() {
    setTapeOpen(true);
    requestAnimationFrame(() => {
      const el = document.getElementById('play-the-tape-card');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function scrollToUrgeLog() {
    requestAnimationFrame(() => {
      const el = document.getElementById('urge-log-card');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <>
      <style>{`
        .recov-disclosure { margin-bottom: 14px; }
        .recov-disclosure > summary {
          list-style: none; cursor: pointer;
          padding: 14px 16px; border-radius: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; justify-content: space-between;
          font-family: var(--font-mono); font-size: 11px; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text-secondary);
          -webkit-tap-highlight-color: transparent;
        }
        .recov-disclosure > summary::-webkit-details-marker { display: none; }
        .recov-disclosure > summary::after {
          content: '+'; font-family: var(--font-mono); font-size: 16px;
          color: var(--text-tertiary); transition: transform 200ms ease;
        }
        .recov-disclosure[open] > summary::after { content: '−'; }
        .recov-disclosure > .recov-disclosure-body { margin-top: 12px; }
      `}</style>

      <PageHeader title="Recovery" accent="recovery" />

      <StreakCard refreshKey={streakRefreshKey} />

      <button
        onClick={() => setCrisisOpen(true)}
        style={{
          width: '100%',
          marginBottom: 22,
          padding: '14px 18px',
          border: '1px solid rgba(255,107,107,0.32)',
          background: 'rgba(255,107,107,0.06)',
          color: 'var(--danger)',
          borderRadius: 14,
          fontFamily: 'var(--font-sans)',
          fontSize: 13, fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          WebkitTapHighlightColor: 'transparent',
          minHeight: 48,
          transition: 'background 160ms ease',
        }}
      >
        <LifeBuoy size={16} strokeWidth={1.75} />
        I need help right now
      </button>

      <UrgeLog
        onUrgeLogged={() => setUrgeRefreshKey(k => k + 1)}
        onPlayTape={openTape}
      />

      <UrgePatterns refreshKey={urgeRefreshKey} />

      <details className="recov-disclosure" open={tapeOpen} onToggle={e => setTapeOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Play it forward</summary>
        <div className="recov-disclosure-body">
          <PlayTheTape />
        </div>
      </details>

      <details className="recov-disclosure">
        <summary>Relapse prevention plan</summary>
        <div className="recov-disclosure-body">
          <RelapsePreventionPlan />
        </div>
      </details>

      <details className="recov-disclosure">
        <summary>Relapse log</summary>
        <div className="recov-disclosure-body">
          <RelapseLog onRelapse={() => { setStreakRefreshKey(k => k + 1); setUrgeRefreshKey(k => k + 1); }} />
        </div>
      </details>

      <CrisisMode
        open={crisisOpen}
        onClose={() => setCrisisOpen(false)}
        onOpenPlayTape={openTape}
        onOpenLogUrge={scrollToUrgeLog}
      />
    </>
  );
}
