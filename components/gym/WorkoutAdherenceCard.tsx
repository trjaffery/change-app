'use client';
import { useCallback, useEffect, useState } from 'react';

interface SplitDay { day_of_week: number[] | null; name: string }
interface Split { is_active: boolean; split_days: SplitDay[] }
interface Session { date: string }

const WINDOW_DAYS = 14;

export default function WorkoutAdherenceCard({ refreshKey }: { refreshKey: number }) {
  const [planned, setPlanned] = useState<number | null>(null);
  const [logged, setLogged] = useState<number>(0);
  const [hasActiveSplit, setHasActiveSplit] = useState(false);
  const [hasScheduledDays, setHasScheduledDays] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [splitsRes, sessionsRes] = await Promise.all([
        fetch('/api/gym/splits'),
        // 50 sessions is more than enough to cover a 14-day window for any realistic schedule.
        fetch('/api/gym/sessions?limit=50&offset=0'),
      ]);
      const splits = (await splitsRes.json()) as Split[];
      const sessions = (await sessionsRes.json()) as Session[];

      const active = (Array.isArray(splits) ? splits : []).find(s => s.is_active);
      setHasActiveSplit(!!active);
      if (!active) { setPlanned(null); setLogged(0); return; }

      const scheduledDows = new Set<number>();
      for (const day of (active.split_days ?? [])) {
        for (const dow of (day.day_of_week ?? [])) scheduledDows.add(dow);
      }
      setHasScheduledDays(scheduledDows.size > 0);
      if (scheduledDows.size === 0) { setPlanned(null); setLogged(0); return; }

      // Planned: count of days in the trailing WINDOW_DAYS whose dow is in scheduledDows.
      const today = new Date();
      let plannedCount = 0;
      for (let i = 0; i < WINDOW_DAYS; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (scheduledDows.has(d.getDay())) plannedCount++;
      }
      setPlanned(plannedCount);

      // Logged: distinct workout dates in the same window.
      const cutoffMs = Date.now() - WINDOW_DAYS * 86400000;
      const loggedDates = new Set<string>();
      for (const s of (Array.isArray(sessions) ? sessions : [])) {
        if (new Date(s.date + 'T12:00:00').getTime() >= cutoffMs) loggedDates.add(s.date);
      }
      setLogged(loggedDates.size);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return null;
  if (!hasActiveSplit) return null;

  if (!hasScheduledDays) {
    return (
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-title">Adherence · last {WINDOW_DAYS} days</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Set day-of-week schedules on your active split&apos;s days to track adherence.
        </div>
      </div>
    );
  }

  const pct = planned && planned > 0 ? Math.min(100, Math.round((logged / planned) * 100)) : 0;
  const tone = pct >= 80 ? '#6BE3A4' : pct >= 50 ? '#F2C063' : '#FF6B6B';

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Adherence · last {WINDOW_DAYS} days</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 800, color: tone, letterSpacing: '-0.02em' }}>
          {pct}%
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {logged} of {planned} planned session{planned === 1 ? '' : 's'} logged
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}
