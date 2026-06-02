'use client';
import { useCallback, useEffect, useState } from 'react';

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface SplitExercise { id: string; exercise: string; target_sets: number; target_reps: string; body_part: string | null; position: number }

const BODY_PARTS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio'];
interface SplitDay { id: string; name: string; day_of_week: number[] | null; position: number; split_exercises: SplitExercise[] }
interface Split { id: string; name: string; is_active: boolean; split_days: SplitDay[] }

export default function SplitManager() {
  const [splits, setSplits] = useState<Split[]>([]);
  const [expandedSplit, setExpandedSplit] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [newSplitName, setNewSplitName] = useState('');
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [newDayName, setNewDayName] = useState('');
  const [newDayDow, setNewDayDow] = useState<number[]>([]);
  const [addingEx, setAddingEx] = useState<string | null>(null);
  const [newEx, setNewEx] = useState('');
  const [newExSets, setNewExSets] = useState(3);
  const [newExReps, setNewExReps] = useState('8');
  const [newExBodyPart, setNewExBodyPart] = useState('');
  const [allExercises, setAllExercises] = useState<string[]>([]);
  // Inline editing state
  const [editingSplitName, setEditingSplitName] = useState<string | null>(null);
  const [editSplitNameVal, setEditSplitNameVal] = useState('');
  const [editingDayName, setEditingDayName] = useState<string | null>(null);
  const [editDayNameVal, setEditDayNameVal] = useState('');
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [editExVal, setEditExVal] = useState('');
  const [editExSets, setEditExSets] = useState(3);
  const [editExReps, setEditExReps] = useState('8');
  const [editExBodyPart, setEditExBodyPart] = useState('');

  const fetchSplits = useCallback(async () => {
    const res = await fetch('/api/gym/splits');
    const data = await res.json();
    setSplits(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetchSplits();
    fetch('/api/gym/exercises').then(r => r.json()).then(setAllExercises);
  }, [fetchSplits]);

  async function patch(url: string, body: Record<string, unknown>) {
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    fetchSplits();
  }

  async function createSplit() {
    if (!newSplitName.trim()) return;
    await fetch('/api/gym/splits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSplitName.trim() }) });
    setNewSplitName(''); fetchSplits();
  }

  async function deleteSplit(id: string) {
    if (!confirm('Delete this split and all its days/exercises?')) return;
    await fetch(`/api/gym/splits/${id}`, { method: 'DELETE' }); fetchSplits();
  }

  async function setActive(id: string) {
    await patch(`/api/gym/splits/${id}`, { is_active: true });
  }

  async function addDay(splitId: string) {
    if (!newDayName.trim()) return;
    await fetch(`/api/gym/splits/${splitId}/days`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newDayName.trim(), day_of_week: newDayDow.length ? newDayDow : null }) });
    setNewDayName(''); setNewDayDow([]); setAddingDay(null); fetchSplits();
  }

  async function deleteDay(id: string) {
    await fetch(`/api/gym/split-days/${id}`, { method: 'DELETE' }); fetchSplits();
  }

  async function addExercise(dayId: string) {
    if (!newEx.trim()) return;
    await fetch(`/api/gym/split-days/${dayId}/exercises`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise: newEx.trim(), target_sets: newExSets, target_reps: newExReps, body_part: newExBodyPart || null }) });
    setNewEx(''); setNewExSets(3); setNewExReps('8'); setNewExBodyPart(''); setAddingEx(null); fetchSplits();
  }

  async function deleteExercise(id: string) {
    await fetch(`/api/gym/split-exercises/${id}`, { method: 'DELETE' }); fetchSplits();
  }

  async function saveSplitName(id: string) {
    if (editSplitNameVal.trim()) await patch(`/api/gym/splits/${id}`, { name: editSplitNameVal.trim() });
    setEditingSplitName(null);
  }

  async function saveDayName(id: string) {
    if (editDayNameVal.trim()) await patch(`/api/gym/split-days/${id}`, { name: editDayNameVal.trim() });
    setEditingDayName(null);
  }

  async function saveExercise(id: string) {
    await patch(`/api/gym/split-exercises/${id}`, { exercise: editExVal.trim(), target_sets: editExSets, target_reps: editExReps, body_part: editExBodyPart || null });
    setEditingExId(null);
  }

  function renderSplit(split: Split) {
    const isExpanded = expandedSplit === split.id;

    return (
      <div key={split.id} className={`split-card${split.is_active ? ' active' : ''}`}>
        {/* Split header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isExpanded || split.split_days.length > 0 ? 12 : 0 }}>
          {editingSplitName === split.id ? (
            <input className="text-input" value={editSplitNameVal} onChange={e => setEditSplitNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveSplitName(split.id); if (e.key === 'Escape') setEditingSplitName(null); }}
              autoFocus style={{ flex: 1, padding: '6px 10px', fontSize: 14 }} />
          ) : (
            <div style={{ flex: 1, fontSize: 15, fontWeight: 700, cursor: isExpanded ? 'text' : 'default' }}
              onClick={() => { if (isExpanded) { setEditingSplitName(split.id); setEditSplitNameVal(split.name); } }}>
              {split.name}
            </div>
          )}
          {split.is_active
            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(107,227,164,0.15)', color: 'var(--success)', border: '1px solid rgba(107,227,164,0.25)', flexShrink: 0 }}>Active</span>
            : <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 11 }} onClick={() => setActive(split.id)}>Set active</button>}
          <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 11 }} onClick={() => { setExpandedSplit(isExpanded ? null : split.id); setExpandedDay(null); }}>
            {isExpanded ? 'Done' : 'Edit'}
          </button>
          <button className="split-icon-btn" onClick={() => deleteSplit(split.id)}>×</button>
        </div>

        {/* Summary view (not editing) */}
        {!isExpanded && split.split_days.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {split.split_days.map(day => (
              <div key={day.id} style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', fontSize: 12, fontWeight: 600 }}>
                {day.name}
                {day.day_of_week?.length ? <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)' }}>{day.day_of_week.map(d => DAYS_SHORT[d]).join('/')}</span> : null}
              </div>
            ))}
          </div>
        )}

        {/* Edit view */}
        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {split.split_days.map(day => {
              const isDayExpanded = expandedDay === day.id;
              return (
                <div key={day.id} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                  {/* Day header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer' }} onClick={() => setExpandedDay(isDayExpanded ? null : day.id)}>
                    {editingDayName === day.id ? (
                      <input className="text-input" value={editDayNameVal} onChange={e => setEditDayNameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveDayName(day.id); if (e.key === 'Escape') setEditingDayName(null); }}
                        onClick={e => e.stopPropagation()} autoFocus style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} />
                    ) : (
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}
                        onDoubleClick={e => { e.stopPropagation(); setEditingDayName(day.id); setEditDayNameVal(day.name); }}>
                        {day.name}
                      </span>
                    )}
                    {day.day_of_week?.length
                      ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)' }}>{day.day_of_week.map(d => DAYS_SHORT[d]).join('/')}</span>
                      : null}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)' }}>{day.split_exercises.length} ex</span>
                    <button className="split-icon-btn" onClick={e => { e.stopPropagation(); deleteDay(day.id); }}>×</button>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{isDayExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Exercises */}
                  {isDayExpanded && (
                    <div style={{ padding: '0 12px 12px' }}>
                      {day.split_exercises.map((ex, i) => (
                        <div key={ex.id}>
                          {editingExId === ex.id ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 4 }}>
                              <input className="text-input" list="ex-suggestions-edit" value={editExVal} onChange={e => setEditExVal(e.target.value)} style={{ flex: 1, minWidth: 100, padding: '5px 8px', fontSize: 12 }} />
                              <input className="text-input" type="number" min={1} max={20} value={editExSets} onChange={e => setEditExSets(Number(e.target.value))} style={{ width: 52, padding: '5px 8px', fontSize: 12 }} />
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>×</span>
                              <input className="text-input" value={editExReps} onChange={e => setEditExReps(e.target.value)} style={{ width: 56, padding: '5px 8px', fontSize: 12 }} />
                              <select value={editExBodyPart} onChange={e => setEditExBodyPart(e.target.value)} className="text-input" style={{ width: 110, padding: '5px 8px', fontSize: 12, background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)' }}>
                                <option value="">No body part</option>
                                {BODY_PARTS.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                              <button className="btn-primary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => saveExercise(ex.id)}>Save</button>
                              <button className="split-icon-btn" onClick={() => setEditingExId(null)}>×</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', marginBottom: 4, cursor: 'pointer' }}
                              onClick={() => { setEditingExId(ex.id); setEditExVal(ex.exercise); setEditExSets(ex.target_sets); setEditExReps(ex.target_reps); setEditExBodyPart(ex.body_part ?? ''); }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', width: 16 }}>{i + 1}</span>
                              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{ex.exercise}</span>
                              {ex.body_part && (
                                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)' }}>{ex.body_part}</span>
                              )}
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{ex.target_sets}×{ex.target_reps}</span>
                              <button className="split-icon-btn" onClick={e => { e.stopPropagation(); deleteExercise(ex.id); }}>×</button>
                            </div>
                          )}
                        </div>
                      ))}
                      <datalist id="ex-suggestions-edit">{allExercises.map(e => <option key={e} value={e} />)}</datalist>

                      {addingEx === day.id ? (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input className="text-input" list="ex-suggestions" placeholder="Exercise name…" value={newEx} onChange={e => setNewEx(e.target.value)} autoFocus />
                          <datalist id="ex-suggestions">{allExercises.map(e => <option key={e} value={e} />)}</datalist>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input className="text-input" type="number" min={1} max={20} value={newExSets} onChange={e => setNewExSets(Number(e.target.value))} style={{ width: 60 }} placeholder="Sets" />
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>sets ×</span>
                            <input className="text-input" value={newExReps} onChange={e => setNewExReps(e.target.value)} style={{ width: 70 }} placeholder="Reps" />
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>reps</span>
                            <select value={newExBodyPart} onChange={e => setNewExBodyPart(e.target.value)} className="text-input" style={{ width: 130, background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)' }}>
                              <option value="">Body part…</option>
                              {BODY_PARTS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <button className="btn-primary" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => addExercise(day.id)}>Add</button>
                            <button className="btn-secondary" style={{ padding: '7px 10px', fontSize: 12 }} onClick={() => setAddingEx(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn-secondary" style={{ marginTop: 6, padding: '6px 14px', fontSize: 12 }} onClick={() => setAddingEx(day.id)}>+ Add exercise</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add day */}
            {addingDay === split.id ? (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input className="text-input" placeholder="Day name (e.g. Push Day)…" value={newDayName} onChange={e => setNewDayName(e.target.value)} autoFocus />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Link to days of week (optional)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {DAYS_SHORT.map((d, i) => (
                      <button key={d} className={`dow-btn${newDayDow.includes(i) ? ' active' : ''}`} onClick={() => setNewDayDow(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i])}>{d}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary" style={{ padding: '8px 16px', fontSize: 12 }} onClick={() => addDay(split.id)}>Add Day</button>
                  <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => { setAddingDay(null); setNewDayName(''); setNewDayDow([]); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setAddingDay(split.id)}>+ Add day</button>
            )}
          </div>
        )}

        {!isExpanded && split.split_days.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No days yet — click Edit to add workout days.</div>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{`
        .split-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:14px; padding:16px 18px; margin-bottom:12px; }
        .split-card.active { border-color:rgba(107,227,164,0.25); background:rgba(107,227,164,0.04); }
        .split-icon-btn { background:none; border:none; color:var(--text-tertiary); cursor:pointer; font-size:18px; padding:0 4px; opacity:0.5; transition:opacity 0.15s, color 0.15s; flex-shrink:0; line-height:1; }
        .split-icon-btn:hover { opacity:1; color:var(--danger); }
        .dow-btn { width:32px; height:30px; border-radius:7px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--text-secondary); font-size:11px; font-weight:600; cursor:pointer; transition:all 0.15s; }
        .dow-btn.active { border-color:rgba(107,227,164,0.5); background:rgba(107,227,164,0.12); color:var(--success); }
      `}</style>

      <div style={{ marginBottom: 22 }}>
        <div className="section-title">Your Splits</div>

        {splits.length === 0 && <div className="empty-state" style={{ marginBottom: 12 }}>No splits yet — create one below to get started.</div>}

        {splits.map(s => renderSplit(s))}

        <div style={{ display: 'flex', gap: 8 }}>
          <input className="text-input" placeholder="New split name (e.g. PPL, Upper/Lower)…" value={newSplitName} onChange={e => setNewSplitName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createSplit()} style={{ flex: 1 }} />
          <button className="btn-primary" style={{ padding: '10px 18px', fontSize: 13 }} onClick={createSplit}>Create</button>
        </div>
      </div>
    </>
  );
}
