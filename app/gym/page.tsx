'use client';
import { useState } from 'react';
import SplitManager from '@/components/gym/SplitManager';
import DaySelector from '@/components/gym/DaySelector';
import WorkoutSession from '@/components/gym/WorkoutSession';
import ProgressGraph from '@/components/gym/ProgressGraph';

export default function GymPage() {
  const [view, setView] = useState<'home' | 'select' | 'session'>('home');
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [dayLabel, setDayLabel] = useState('');
  const [graphKey, setGraphKey] = useState(0);

  function startDay(dayId: string | null, label: string) {
    setActiveDayId(dayId);
    setDayLabel(label);
    setView('session');
  }

  function finish() {
    setView('home');
    setActiveDayId(null);
    setDayLabel('');
    setGraphKey(k => k + 1);
  }

  return (
    <>
      <h1 className="page-title">Gym</h1>
      {view === 'home' && (
        <>
          <SplitManager />
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, marginBottom: 22 }}
            onClick={() => setView('select')}
          >
            Start Workout
          </button>
          <ProgressGraph refreshKey={graphKey} />
        </>
      )}
      {view === 'select' && (
        <DaySelector onStart={startDay} onCancel={() => setView('home')} />
      )}
      {view === 'session' && (
        <WorkoutSession splitDayId={activeDayId} dayLabel={dayLabel} onFinish={finish} />
      )}
    </>
  );
}
