'use client';
import { useState } from 'react';
import HomeCommandBar from '@/components/dashboard/HomeCommandBar';
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
        .home-board {
          --home-line: rgba(255,255,255,0.075);
          --home-line-strong: rgba(255,255,255,0.13);
          --home-panel: rgba(255,255,255,0.018);
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding-bottom: 18px;
        }

        .home-command {
          position: sticky;
          top: 0;
          z-index: 20;
          background: linear-gradient(180deg, var(--bg-base) 0%, color-mix(in srgb, var(--bg-base) 86%, transparent) 100%);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          margin: 0 -6px;
          padding: 0 6px;
        }

        .home-workbench {
          display: grid;
          grid-template-columns: minmax(0, 1.58fr) minmax(330px, 0.92fr);
          gap: 28px;
          align-items: start;
        }

        .home-lane {
          position: relative;
          min-width: 0;
        }
        .home-lane::before {
          content: '';
          position: absolute;
          left: -14px;
          top: 4px;
          bottom: 4px;
          width: 1px;
          background: linear-gradient(180deg, transparent, var(--home-line-strong) 12%, var(--home-line) 88%, transparent);
        }
        .home-lane-label {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 12px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-tertiary);
        }
        .home-lane-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--home-line);
        }

        .home-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }

        .home-board .card {
          margin-bottom: 0 !important;
          border-radius: 0;
          border: 0;
          border-top: 1px solid var(--home-line);
          background: transparent;
          box-shadow: none;
          padding: 18px 0 0;
        }
        .home-board .dc-card {
          border-radius: 0;
          border: 0;
          border-top: 1px solid var(--home-line);
          background: transparent;
          box-shadow: none;
          padding: 16px 0 0;
        }
        .home-board .dc-card:hover {
          border-color: var(--home-line);
        }
        .home-workbench .card {
          border-top-color: transparent;
          padding-top: 0;
        }
        .home-primary .card {
          min-height: 420px;
          padding-right: 8px;
        }
        .home-side .card {
          padding: 16px 0;
          border-top-color: var(--home-line);
        }
        .home-side .card:first-of-type {
          padding-top: 0;
          border-top: 0;
        }

        .home-activity {
          position: relative;
          padding: 18px 0 4px;
          border-top: 1px solid var(--home-line-strong);
          border-bottom: 1px solid var(--home-line);
        }
        .home-activity::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, var(--success), transparent 38%, transparent 62%, #78B4FF);
          opacity: 0.5;
        }
        .home-activity .card {
          border-top: 0;
          padding-top: 0;
        }

        .home-reflection {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.8fr);
          gap: 28px;
          align-items: start;
        }
        .home-reflection .card {
          padding-top: 18px;
        }

        .home-board .section-title {
          font-size: 13px;
          letter-spacing: 0.01em;
        }

        @media (max-width: 980px) {
          .home-workbench,
          .home-reflection {
            grid-template-columns: 1fr;
          }
          .home-lane::before {
            display: none;
          }
          .home-primary .card {
            min-height: 0;
            padding-right: 0;
          }
        }

        @media (max-width: 640px) {
          .home-board {
            gap: 22px;
          }
          .home-command {
            position: relative;
            margin: 0;
            padding: 0;
            background: transparent;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .home-workbench {
            gap: 22px;
          }
        }
      `}</style>
      <PageHeader title="Change" accent="home" />

      <main className="home-board">
        <div className="home-command">
          <HomeCommandBar done={done} total={total} />
        </div>

        <section className="home-workbench" aria-label="Today's dashboard">
          <div className="home-lane home-primary">
            <div className="home-lane-label">Work lane</div>
            <DailyTasks />
          </div>

          <aside className="home-lane home-side">
            <div className="home-lane-label">Daily rhythm</div>
            <div className="home-stack">
              <HabitList
                onCompletionChange={(d, t) => { setDone(d); setTotal(t); }}
                onCompletionPersisted={() => setCalKey(k => k + 1)}
              />
              <DiaryCard hideMood />
            </div>
          </aside>
        </section>

        <section className="home-activity" aria-label="Activity map">
          <HabitCalendar refreshKey={calKey} signature title="30-day activity" />
        </section>

        <section className="home-reflection" aria-label="Reflection">
          <Insights />
          <WeeklyReview />
        </section>
      </main>
    </>
  );
}
