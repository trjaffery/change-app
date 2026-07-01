'use client';
import { useState } from 'react';
import CompletionRing from '@/components/dashboard/CompletionRing';
import DailyTasks from '@/components/dashboard/DailyTasks';
import DiaryCard from '@/components/dashboard/DiaryCard';
import HabitList from '@/components/habits/HabitList';
import HabitCalendar from '@/components/habits/HabitCalendar';
import WeeklyReview from '@/components/dashboard/WeeklyReview';
import Insights from '@/components/dashboard/Insights';
import PageHeader from '@/components/layout/PageHeader';

export default function DashboardPage() {
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [calKey, setCalKey] = useState(0);

  return (
    <>
      <style>{`
        .home-disclosure { margin-bottom: 14px; }
        .home-disclosure > summary {
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
        .home-disclosure > summary::-webkit-details-marker { display: none; }
        .home-disclosure > summary::after {
          content: '+'; font-family: var(--font-mono); font-size: 16px;
          color: var(--text-tertiary); transition: transform 200ms ease;
        }
        .home-disclosure[open] > summary::after { content: '−'; }
        .home-disclosure > .home-disclosure-body { margin-top: 12px; }
      `}</style>
      <PageHeader title="Change" accent="home" />
      <CompletionRing done={done} total={total} />
      <DailyTasks />
      <DiaryCard />
      <HabitList
        onCompletionChange={(d, t) => { setDone(d); setTotal(t); }}
        onCompletionPersisted={() => setCalKey(k => k + 1)}
      />
      <details className="home-disclosure">
        <summary>Habit history</summary>
        <div className="home-disclosure-body">
          <HabitCalendar refreshKey={calKey} />
        </div>
      </details>
      <Insights />
      <WeeklyReview />
    </>
  );
}
