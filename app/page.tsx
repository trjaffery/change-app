'use client';
import { useState } from 'react';
import DailyBriefing from '@/components/dashboard/DailyBriefing';
import CompletionRing from '@/components/dashboard/CompletionRing';
import GoalTicker from '@/components/dashboard/GoalTicker';
import DailyGoals from '@/components/dashboard/DailyGoals';
import DiaryCard from '@/components/dashboard/DiaryCard';
import HabitList from '@/components/habits/HabitList';
import HabitCalendar from '@/components/habits/HabitCalendar';
import HabitCoach from '@/components/habits/HabitCoach';
import WeeklyReview from '@/components/dashboard/WeeklyReview';
import Insights from '@/components/dashboard/Insights';

export default function DashboardPage() {
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [calKey, setCalKey] = useState(0);

  return (
    <>
      <h1 className="page-title">Change</h1>
      <DailyBriefing />
      <GoalTicker />
      <CompletionRing done={done} total={total} />
      <DailyGoals />
      <DiaryCard />
      <HabitList
        onCompletionChange={(d, t) => { setDone(d); setTotal(t); }}
        onCompletionPersisted={() => setCalKey(k => k + 1)}
      />
      <HabitCalendar refreshKey={calKey} />
      <HabitCoach />
      <WeeklyReview />
      <Insights />
    </>
  );
}
