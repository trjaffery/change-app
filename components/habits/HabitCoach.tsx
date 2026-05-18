'use client';
import { useState } from 'react';

interface HabitInsight { habitName: string; status: 'crushing' | 'on_track' | 'struggling'; advice: string }
interface CoachData { insights: HabitInsight[]; newHabitSuggestion?: string }

const STATUS_CONFIG = {
  crushing:   { label: 'Crushing it', color: 'var(--success)', bg: 'rgba(107,227,164,0.12)', border: 'rgba(107,227,164,0.25)' },
  on_track:   { label: 'On track',    color: '#F2C063',        bg: 'rgba(242,192,99,0.10)',   border: 'rgba(242,192,99,0.25)' },
  struggling: { label: 'Struggling',  color: 'var(--danger)',  bg: 'rgba(255,107,107,0.08)',  border: 'rgba(255,107,107,0.2)' },
};

export default function HabitCoach() {
  const [data, setData] = useState<CoachData | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyse() {
    setLoading(true);
    const res = await fetch('/api/ai/habit-coach', { method: 'POST' });
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data ? 16 : 0 }}>
        <div className="section-title" style={{ margin: 0 }}>Habit Coach</div>
        <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={analyse} disabled={loading}>
          {loading ? 'Analysing…' : data ? '↺ Re-analyse' : 'Analyse my habits'}
        </button>
      </div>

      {data && (
        <>
          {data.insights.length === 0 && (
            <div className="empty-state">No habits to analyse yet.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {data.insights.map((insight, i) => {
              const cfg = STATUS_CONFIG[insight.status];
              return (
                <div key={i} style={{ padding: '12px 14px', borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{insight.habitName}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: cfg.border, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{insight.advice}</p>
                </div>
              );
            })}
          </div>

          {data.newHabitSuggestion && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>New habit idea</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{data.newHabitSuggestion}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
