'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

type HabitStatus = 'crushing' | 'on_track' | 'struggling' | 'new';

interface HabitStatusResult {
  habitId: string; name: string; status: HabitStatus;
  completion_rate: number; days_hit: number; expected_days: number;
  current_streak: number; schedule_type: string; schedule_count: number | null;
  goal_value: number; goal_period: string; is_new: boolean;
  total_count: number; target_count: number;
}

interface AdvicePayload { habitId: string; advice: string }
interface CoachPostResponse { insights: AdvicePayload[]; newHabitSuggestion?: string | null }

const STATUS_CONFIG: Record<HabitStatus, { label: string; color: string; bg: string; border: string }> = {
  crushing:   { label: 'Crushing it', color: 'var(--success)', bg: 'rgba(107,227,164,0.12)', border: 'rgba(107,227,164,0.25)' },
  on_track:   { label: 'On track',    color: '#F2C063',        bg: 'rgba(242,192,99,0.10)',   border: 'rgba(242,192,99,0.25)' },
  struggling: { label: 'Struggling',  color: 'var(--danger)',  bg: 'rgba(255,107,107,0.08)',  border: 'rgba(255,107,107,0.20)' },
  new:        { label: 'Just started', color: '#5B9FE8',       bg: 'rgba(91,159,232,0.08)',   border: 'rgba(91,159,232,0.20)' },
};

export default function HabitCoach() {
  const [statuses, setStatuses] = useState<HabitStatusResult[] | null>(null);
  const [advice, setAdvice] = useState<CoachPostResponse | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/ai/habit-coach');
        const data = await res.json() as { statuses: HabitStatusResult[] };
        setStatuses(data.statuses ?? []);
      } catch { setStatuses([]); }
    })();
  }, []);

  async function getAdvice() {
    if (!statuses) return;
    setAdviceLoading(true);
    setAdviceError(null);
    try {
      const struggling = statuses.filter(s => s.status === 'struggling');
      const res = await fetch('/api/ai/habit-coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ struggling, total_habits: statuses.length }),
      });
      const data = await res.json() as CoachPostResponse & { error?: string };
      if (data.error) setAdviceError(data.error);
      else setAdvice(data);
    } catch (e) {
      setAdviceError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setAdviceLoading(false);
    }
  }

  if (!statuses) {
    return <div className="card" style={{ marginBottom: 22, minHeight: 120 }} />;
  }

  if (statuses.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-title">Habit Coach</div>
        <div className="empty-state">Add a habit to start tracking.</div>
      </div>
    );
  }

  const strugglingHabits = statuses.filter(s => s.status === 'struggling');
  const adviceById = Object.fromEntries((advice?.insights ?? []).map(a => [a.habitId, a.advice]));

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>Habit Coach</div>
        {strugglingHabits.length > 0 && (
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={getAdvice} disabled={adviceLoading}>
            <Sparkles size={11} strokeWidth={2} />
            {adviceLoading ? 'Thinking…' : advice ? 'Re-ask' : `Get advice (${strugglingHabits.length})`}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {statuses.map(s => {
          const cfg = STATUS_CONFIG[s.status];
          const adviceText = adviceById[s.habitId];
          return (
            <div key={s.habitId} style={{ padding: '12px 14px', borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: adviceText ? 6 : 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: cfg.border, color: cfg.color }}>
                  {cfg.label}
                </span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {s.days_hit}/{s.expected_days}d · streak {s.current_streak}d
                </span>
              </div>
              {adviceText && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{adviceText}</p>
              )}
            </div>
          );
        })}
      </div>

      {adviceError && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--danger)', fontStyle: 'italic' }}>{adviceError}</div>
      )}

      {advice?.newHabitSuggestion && (
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>New habit idea</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{advice.newHabitSuggestion}</p>
        </div>
      )}
    </div>
  );
}
