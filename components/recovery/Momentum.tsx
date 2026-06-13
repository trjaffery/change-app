'use client';
import { useEffect, useState } from 'react';
import { Waves, LifeBuoy, ShieldCheck, Smile } from 'lucide-react';

interface Win {
  kind: 'surf' | 'crisis' | 'urge_no_act' | 'high_mood';
  date: string;
  label: string;
}

interface MomentumData {
  stats: {
    current_streak: number | null;
    longest_streak: number | null;
    crisis_survived: number;
    surfs_completed: number;
    surfs_total: number;
    mood_high_days_30: number;
    urges_no_act_30: number;
  };
  recent_wins: Win[];
}

const KIND_ICON = { surf: Waves, crisis: LifeBuoy, urge_no_act: ShieldCheck, high_mood: Smile };
const KIND_COLOR: Record<Win['kind'], string> = { surf: '#78B4FF', crisis: 'var(--success)', urge_no_act: '#F2C063', high_mood: '#C09BE6' };

function relative(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  if (!data) return <div className="card" style={{ marginBottom: 22, minHeight: 180 }} />;

  const { stats, recent_wins } = data;
  const surfRate = stats.surfs_total > 0 ? Math.round((stats.surfs_completed / stats.surfs_total) * 100) : null;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .mo-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .mo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 18px; }
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
        .mo-section-label {
          font-family: var(--font-mono); font-size: 9px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 10px;
        }
        .mo-win {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; margin-bottom: 4px;
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
        }
        .mo-win-icon {
          width: 28px; height: 28px; border-radius: 8px;
          background: rgba(255,255,255,0.04);
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .mo-win-text { flex: 1; font-size: 13px; color: var(--text-secondary); line-height: 1.4; }
        .mo-win-when {
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary); flex-shrink: 0;
        }
        .mo-empty {
          font-size: 12px; color: var(--text-tertiary);
          font-style: italic; padding: 4px 0; line-height: 1.5;
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
          <div className="mo-stat-label">Surfs completed</div>
          <div className="mo-stat-value">{stats.surfs_completed}<span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4, fontWeight: 600 }}>/{stats.surfs_total}</span></div>
          {surfRate !== null && <div className="mo-stat-sub">{surfRate}% rate</div>}
        </div>
        <div className="mo-stat">
          <div className="mo-stat-label">Urges, didn&apos;t act</div>
          <div className="mo-stat-value">{stats.urges_no_act_30}</div>
          <div className="mo-stat-sub">last 30 days</div>
        </div>
        <div className="mo-stat">
          <div className="mo-stat-label">Crisis survived</div>
          <div className="mo-stat-value">{stats.crisis_survived}</div>
          <div className="mo-stat-sub">all-time</div>
        </div>
      </div>

      <div className="mo-section-label">Recent wins</div>
      {recent_wins.length === 0 ? (
        <div className="mo-empty">Surf an urge, make it through a crisis moment, or log a high-mood day — wins will collect here.</div>
      ) : (
        recent_wins.map((w, i) => {
          const Icon = KIND_ICON[w.kind];
          return (
            <div key={i} className="mo-win">
              <span className="mo-win-icon" style={{ color: KIND_COLOR[w.kind] }}>
                <Icon size={14} strokeWidth={1.75} />
              </span>
              <span className="mo-win-text">{w.label}</span>
              <span className="mo-win-when">{relative(w.date)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
