'use client';
import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import StreakCard from '@/components/recovery/StreakCard';
import UrgeLog from '@/components/recovery/UrgeLog';
import UrgePatterns from '@/components/recovery/UrgePatterns';
import Momentum from '@/components/recovery/Momentum';
import RelapseLog from '@/components/recovery/RelapseLog';
import RelapsePreventionPlan from '@/components/recovery/RelapsePreventionPlan';
import PlayTheTape from '@/components/recovery/PlayTheTape';
import CrisisMode from '@/components/recovery/CrisisMode';

export default function RecoveryPage() {
  const [urgeRefreshKey, setUrgeRefreshKey] = useState(0);
  // Phase 1 #1: bump when a relapse is logged/deleted so StreakCard re-anchors
  // to the most recent relapse (or sobriety_start, whichever is later).
  const [streakRefreshKey, setStreakRefreshKey] = useState(0);
  const [crisisOpen, setCrisisOpen] = useState(false);

  function scrollTo(id: string) {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <>
      <h1 className="page-title">Recovery</h1>

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

      <UrgeLog onUrgeLogged={() => setUrgeRefreshKey(k => k + 1)} />

      <PlayTheTape />

      <Momentum refreshKey={urgeRefreshKey} />

      <RelapsePreventionPlan />

      <UrgePatterns refreshKey={urgeRefreshKey} />

      <RelapseLog onRelapse={() => { setStreakRefreshKey(k => k + 1); setUrgeRefreshKey(k => k + 1); }} />

      <CrisisMode
        open={crisisOpen}
        onClose={() => setCrisisOpen(false)}
        onOpenPlayTape={() => scrollTo('play-the-tape-card')}
        onOpenLogUrge={() => scrollTo('urge-log-card')}
      />
    </>
  );
}
