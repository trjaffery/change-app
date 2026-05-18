'use client';
import { useEffect, useState } from 'react';

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface SplitExercise { exercise: string; target_sets: number; target_reps: string }
interface SplitDay { id: string; name: string; day_of_week: number[] | null; split_exercises: SplitExercise[] }
interface Split { id: string; name: string; is_active: boolean; split_days: SplitDay[] }

interface DayOption { splitId: string; splitName: string; day: SplitDay; isActive: boolean }

export default function DaySelector({ onStart, onCancel }: { onStart: (dayId: string | null, dayName: string) => void; onCancel: () => void }) {
  const [splits, setSplits] = useState<Split[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const todayDow = new Date().getDay();

  useEffect(() => {
    fetch('/api/gym/splits').then(r => r.json()).then((data: Split[]) => {
      setSplits(data);
      // Auto-select: first day in active split matching today, else first day of active split
      const active = data.find(s => s.is_active);
      if (!active || !active.split_days.length) return;
      const todayMatch = active.split_days.find(d => d.day_of_week?.includes(todayDow));
      setSelected(todayMatch?.id ?? active.split_days[0].id);
    });
  }, [todayDow]);

  const allOptions: DayOption[] = splits.flatMap(s =>
    s.split_days.map(d => ({ splitId: s.id, splitName: s.name, day: d, isActive: s.is_active }))
  );

  const activeSplitOptions = allOptions.filter(o => o.isActive);
  const otherOptions = allOptions.filter(o => !o.isActive);

  const selectedOption = allOptions.find(o => o.day.id === selected);

  function handleStart() {
    if (!selectedOption) { onStart(null, 'Quick Log'); return; }
    onStart(selectedOption.day.id, `${selectedOption.day.name} — ${selectedOption.splitName}`);
  }

  function DayCard({ option }: { option: DayOption }) {
    const isSelected = selected === option.day.id;
    const isToday = option.day.day_of_week?.includes(todayDow);
    return (
      <button
        onClick={() => setSelected(option.day.id)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
          padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
          background: isSelected ? 'rgba(107,227,164,0.08)' : 'rgba(255,255,255,0.02)',
          border: isSelected ? '1.5px solid rgba(107,227,164,0.4)' : '1px solid rgba(255,255,255,0.07)',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{option.day.name}</span>
          {isToday && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(107,227,164,0.15)', color: 'var(--success)', border: '1px solid rgba(107,227,164,0.3)' }}>Today</span>
          )}
          {isSelected && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="var(--success)" strokeWidth="1.5"/><path d="M4 7L6.2 9.2L10 5" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </div>
        {option.day.day_of_week?.length ? (
          <div style={{ display: 'flex', gap: 4 }}>
            {option.day.day_of_week.map(d => (
              <span key={d} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>{DAYS_SHORT[d]}</span>
            ))}
          </div>
        ) : null}
        {option.day.split_exercises.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {option.day.split_exercises.slice(0, 4).map(e => `${e.exercise} ${e.target_sets}×${e.target_reps}`).join(' · ')}
            {option.day.split_exercises.length > 4 && <span style={{ color: 'var(--text-tertiary)' }}> +{option.day.split_exercises.length - 4} more</span>}
          </div>
        )}
        {option.day.split_exercises.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No exercises added yet</div>
        )}
      </button>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={onCancel}>← Back</button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Start Workout</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{DAYS_FULL[todayDow]}</div>
        </div>
      </div>

      {splits.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 16 }}>No splits yet — go back and create one first.</div>
      )}

      {activeSplitOptions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
            {splits.find(s => s.is_active)?.name ?? 'Active Split'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSplitOptions.map(o => <DayCard key={o.day.id} option={o} />)}
          </div>
        </div>
      )}

      {otherOptions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>Other Splits</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {otherOptions.map(o => <DayCard key={o.day.id} option={o} />)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          className="btn-primary"
          style={{ flex: 1, padding: '13px 20px', fontSize: 14, fontWeight: 700 }}
          onClick={handleStart}
          disabled={!selectedOption}
        >
          Start {selectedOption ? selectedOption.day.name : ''}
        </button>
        <button className="btn-secondary" style={{ padding: '13px 18px', fontSize: 13 }} onClick={() => onStart(null, 'Quick Log')}>
          Quick Log
        </button>
      </div>
    </div>
  );
}
