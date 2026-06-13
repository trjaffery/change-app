'use client';
import { useEffect, useState } from 'react';

interface MomentumData {
  stats: {
    current_streak: number | null;
    longest_streak: number | null;
    crisis_survived: number;
    mood_high_days_30: number;
    urges_no_act: number;
    urges_no_act_since: string | null;
  };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Momentum({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<MomentumData | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/recovery/momentum');
        if (res.ok) setData(await res.json());
      } catch { /* leave skeleton */ }
    })();
  }, [refreshKey]);

  if (!data) return <div className="card" style={{ marginBottom: 22, minHeight: 160 }} />;

  const { stats } = data;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .mo-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .mo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .mo-stat {
          padding: 12px 14px; border-radius: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .mo-stat-label {
          font-family: var(--font-mono); font-size: 9px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 6px;
        }
        .mo-stat-value {
          font-family: var(--font-mono); font-size: 22px; font-weight: 800;
          color: var(--text-primary); line-height: 1;
        }
        .mo-stat-sub {
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary); margin-top: 4px;
        }
      `}</style>

      <div className="mo-head">
        <div className="section-title" style={{ margin: 0 }}>Momentum</div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>earned</span>
      </div>

      <div className="mo-grid">
        <div className="mo-stat">
          <div className="mo-stat-label">Longest streak</div>
          <div className="mo-stat-value">{stats.longest_streak ?? '—'}<span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4, fontWeight: 600 }}>d</span></div>
          {stats.current_streak !== null && stats.longest_streak !== null && (
            <div className="mo-stat-sub">current {stats.current_streak}d</div>
          )}
        </div>
        <div className="mo-stat">
          <div className="mo-stat-label">Crisis survived</div>
          <div className="mo-stat-value">{stats.crisis_survived}</div>
          <div className="mo-stat-sub">all-time</div>
        </div>
        <div className="mo-stat">
          <div className="mo-stat-label">Urges, didn&apos;t act</div>
          <div className="mo-stat-value">{stats.urges_no_act}</div>
          <div className="mo-stat-sub">
            {stats.urges_no_act_since ? `since ${shortDate(stats.urges_no_act_since)}` : 'all-time'}
          </div>
        </div>
        <div className="mo-stat">
          <div className="mo-stat-label">Good mood days</div>
          <div className="mo-stat-value">{stats.mood_high_days_30}</div>
          <div className="mo-stat-sub">mood ≥ 4 · last 30</div>
        </div>
      </div>
    </div>
  );
}
