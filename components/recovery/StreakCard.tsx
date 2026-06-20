'use client';
import { useEffect, useState } from 'react';
import { formatDate, toDateString } from '@/lib/dates';

const MILESTONES = [
  { days: 1, label: '1 Day' }, { days: 3, label: '3 Days' }, { days: 7, label: '1 Week' },
  { days: 14, label: '2 Weeks' }, { days: 30, label: '30 Days' }, { days: 60, label: '60 Days' },
  { days: 90, label: '90 Days' }, { days: 180, label: '6 Months' }, { days: 365, label: '1 Year' },
];

function computeDaysFromIso(iso: string): number {
  const startDate = new Date(iso);
  startDate.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / 86400000));
}

interface Relapse { id: string; created_at: string }

/**
 * Streak anchors to whichever is more recent: the user's `sobriety_start`
 * setting OR the most recent relapse. Previously this only read the setting,
 * so logging a relapse never reset the displayed streak (a real bug).
 *
 * The parent passes `refreshKey` so RelapseLog can bump it after logging and
 * the streak re-anchors immediately without a page reload.
 */
export default function StreakCard({
  onStreakChange,
  refreshKey = 0,
}: {
  onStreakChange?: (days: number) => void;
  refreshKey?: number;
}) {
  const [anchorIso, setAnchorIso] = useState<string>('');
  const [days, setDays] = useState(0);
  const [loading, setLoading] = useState(true);

  async function loadStreak() {
    // Pull sobriety_start + latest relapse in parallel; pick max.
    const [settingsRes, relapsesRes] = await Promise.all([
      fetch('/api/recovery/settings?key=sobriety_start').then(r => r.json()).catch(() => ({})),
      fetch('/api/recovery/relapses').then(r => r.json()).catch(() => []),
    ]);

    let sobrietyIso: string = settingsRes.sobriety_start ?? '';
    // Seed the setting on first use so the streak has a stable origin date.
    if (!sobrietyIso) {
      sobrietyIso = toDateString(new Date());
      await fetch('/api/recovery/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'sobriety_start', value: sobrietyIso }),
      }).catch(() => { /* non-fatal */ });
    }
    const sobrietyStartMs = new Date(sobrietyIso + 'T00:00:00').getTime();

    const relapses = (Array.isArray(relapsesRes) ? relapsesRes : []) as Relapse[];
    // /api/recovery/relapses returns newest-first per route convention; guard either way.
    const latestRelapseMs = relapses
      .map(r => new Date(r.created_at).getTime())
      .reduce((max, t) => Math.max(max, t), 0);

    const anchorMs = Math.max(sobrietyStartMs, latestRelapseMs);
    const anchor = new Date(anchorMs).toISOString();
    setAnchorIso(anchor);
    const d = computeDaysFromIso(anchor);
    setDays(d);
    onStreakChange?.(d);
    setLoading(false);
  }

  useEffect(() => { loadStreak(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 22, minHeight: 220, textAlign: 'center' }}>
        <style>{`
          .sc-sk { background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04)); background-size: 200% 100%; animation: sc-shimmer 1.8s linear infinite; border-radius: 8px; display:inline-block; }
          @keyframes sc-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
        `}</style>
        <span className="sc-sk" style={{ width: 140, height: 88, marginBottom: 12 }} />
        <div><span className="sc-sk" style={{ width: 100, height: 12 }} /></div>
      </div>
    );
  }

  // The "since" label uses YYYY-MM-DD; convert the ISO anchor back into that shape.
  const anchorDate = anchorIso.split('T')[0];

  return (
    <>
      <style>{`
        .milestone-badge { padding:5px 12px; border-radius:999px; border:1px solid rgba(255,255,255,0.08); font-size:11px; font-family:var(--font-mono); font-weight:700; color:var(--text-tertiary); opacity:0.35; transition:all 0.3s; }
        .milestone-badge.earned { opacity:1; color:var(--success); border-color:rgba(107,227,164,0.35); box-shadow:0 0 12px rgba(107,227,164,0.15); }
        .streak-num {
          font-family: var(--font-serif);
          font-style: italic; font-weight: 400;
          font-size: clamp(96px, 18vw, 132px);
          line-height: 0.92;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          margin-bottom: 4px;
          text-shadow: 0 1px 36px rgba(107,227,164,0.18);
        }
      `}</style>
      <div className="card" style={{ marginBottom: 22, textAlign: 'center', padding: '28px 20px' }}>
        <div className="streak-num">{days}</div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
          days clean
        </div>
        {anchorDate && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 22 }}>since {formatDate(anchorDate)}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {MILESTONES.map(m => (
            <div key={m.days} className={`milestone-badge${days >= m.days ? ' earned' : ''}`}>{m.label}</div>
          ))}
        </div>
      </div>
    </>
  );
}
