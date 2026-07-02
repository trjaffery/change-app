'use client';
import { useEffect, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';
import SplitManager from '@/components/gym/SplitManager';
import DaySelector from '@/components/gym/DaySelector';
import WorkoutSession, { GYM_ACTIVE_WORKOUT_KEY, type ActiveWorkoutRecord, type ResumeInfo } from '@/components/gym/WorkoutSession';
import ProgressGraph from '@/components/gym/ProgressGraph';
import WorkoutHistory from '@/components/gym/WorkoutHistory';
import ExerciseSparklineGrid from '@/components/gym/ExerciseSparklineGrid';
import BodyWeightCard from '@/components/gym/BodyWeightCard';
import HealthMetricsCard from '@/components/gym/HealthMetricsCard';
import PageHeader from '@/components/layout/PageHeader';

const REST_PRESETS = [60, 90, 120, 180];

function fmtPreset(s: number) {
  const m = Math.floor(s / 60), r = s % 60;
  if (m > 0 && r > 0) return `${m}m ${r}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export default function GymPage() {
  const [view, setView] = useState<'home' | 'select' | 'session'>('home');
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [dayLabel, setDayLabel] = useState('');
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [graphKey, setGraphKey] = useState(0);
  const [restDuration, setRestDuration] = useState(90);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem('gymRestDuration');
    if (v) setRestDuration(Number(v));
  }, []);

  // Auto-resume: if the app was killed mid-workout (iOS PWA), the active
  // session record survives in localStorage. Same-day only — a workout left
  // over from a previous day stays in History for manual resume.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GYM_ACTIVE_WORKOUT_KEY);
      if (!raw) return;
      const rec = JSON.parse(raw) as ActiveWorkoutRecord;
      if (!rec.sessionId || rec.date !== getActiveDateString()) {
        localStorage.removeItem(GYM_ACTIVE_WORKOUT_KEY);
        return;
      }
      setResume({
        sessionId: rec.sessionId,
        date: rec.date,
        baseElapsed: Math.max(0, Math.floor((Date.now() - rec.startEpoch) / 1000)),
      });
      setActiveDayId(rec.splitDayId ?? null);
      setDayLabel(rec.dayLabel ?? '');
      setView('session');
    } catch {
      localStorage.removeItem(GYM_ACTIVE_WORKOUT_KEY);
    }
  }, []);

  // Flag the workout on <body> so global chrome (the floating settings gear)
  // can hide itself — it overlaps the End button on mobile and navigating
  // away would drop the session.
  useEffect(() => {
    if (view !== 'session') return;
    document.body.setAttribute('data-workout-active', '1');
    return () => document.body.removeAttribute('data-workout-active');
  }, [view]);

  function updateRestDuration(val: number) {
    const clamped = Math.max(10, Math.min(600, val));
    setRestDuration(clamped);
    localStorage.setItem('gymRestDuration', String(clamped));
  }

  function startDay(dayId: string | null, label: string) {
    setResume(null);
    setActiveDayId(dayId);
    setDayLabel(label);
    setView('session');
  }

  // Re-open a past workout from History: same session id, original date, and
  // the timer picks up from the recorded duration.
  function resumeWorkout(info: { sessionId: string; date: string; splitDayId: string | null; dayLabel: string; baseElapsed: number }) {
    setResume({ sessionId: info.sessionId, date: info.date, baseElapsed: info.baseElapsed });
    setActiveDayId(info.splitDayId);
    setDayLabel(info.dayLabel);
    setView('session');
  }

  function finish() {
    setView('home');
    setActiveDayId(null);
    setDayLabel('');
    setResume(null);
    setGraphKey(k => k + 1);
  }

  return (
    <>
      <PageHeader title="Gym" accent="gym" />
      {view === 'home' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Settings
            </button>
          </div>
          {showSettings && (
            <>
              <div className="card" style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Rest timer between sets</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {REST_PRESETS.map(s => (
                    <button
                      key={s}
                      onClick={() => updateRestDuration(s)}
                      style={{
                        padding: '7px 14px', borderRadius: 10, fontSize: 13,
                        background: restDuration === s ? 'rgba(107,227,164,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${restDuration === s ? 'rgba(107,227,164,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        color: restDuration === s ? 'var(--success)' : 'var(--text-secondary)',
                        cursor: 'pointer', fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {fmtPreset(s)}
                    </button>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number" min={10} max={600} value={restDuration}
                      onChange={e => updateRestDuration(Number(e.target.value))}
                      className="text-input"
                      style={{ width: 70, fontFamily: 'var(--font-mono)', fontSize: 13 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>sec</span>
                  </div>
                </div>
              </div>
              <SplitManager />
            </>
          )}
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, marginBottom: 22 }}
            onClick={() => setView('select')}
          >
            Start Workout
          </button>
          <BodyWeightCard />
          <HealthMetricsCard />
          <WorkoutHistory refreshKey={graphKey} onResume={resumeWorkout} />
          <ExerciseSparklineGrid refreshKey={graphKey} />
          <ProgressGraph refreshKey={graphKey} />
        </>
      )}
      {view === 'select' && (
        <DaySelector onStart={startDay} onCancel={() => setView('home')} />
      )}
      {view === 'session' && (
        <WorkoutSession
          key={resume?.sessionId ?? 'new'}
          splitDayId={activeDayId}
          dayLabel={dayLabel}
          onFinish={finish}
          restDuration={restDuration}
          resume={resume}
        />
      )}
    </>
  );
}
