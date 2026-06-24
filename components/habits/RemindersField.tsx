'use client';
import { Plus, X } from 'lucide-react';

/**
 * Multi-time reminder picker shared by the habit add + edit forms.
 *
 * For goal_value > 1 (e.g. drink water 5x/day), the user can configure
 * up to `goalValue` distinct times — that's the natural cap since each
 * reminder maps to one expected completion. For single-completion habits
 * we keep it to a single time slot to avoid noisy duplicate pings.
 */
export default function RemindersField({
  times,
  onChange,
  goalValue,
}: {
  times: string[];
  onChange: (next: string[]) => void;
  goalValue: number;
}) {
  const max = Math.max(1, goalValue);
  const canAdd = times.length < max;

  function setAt(i: number, v: string) {
    const next = [...times];
    next[i] = v;
    onChange(next);
  }
  function removeAt(i: number) {
    onChange(times.filter((_, j) => j !== i));
  }
  function addEmpty() {
    // Default new slot to a sensible next-step time (3h after the last set time)
    // so the user doesn't have to start at 00:00 every time.
    if (times.length === 0) { onChange(['08:00']); return; }
    const last = times[times.length - 1] || '08:00';
    const [h, m] = last.split(':').map(Number);
    const next = ((h * 60 + m) + 180) % (24 * 60);
    const nh = String(Math.floor(next / 60)).padStart(2, '0');
    const nm = String(next % 60).padStart(2, '0');
    onChange([...times, `${nh}:${nm}`]);
  }

  return (
    <div>
      <style>{`
        .rf-label { margin-bottom: 8px; }
        .rf-rows { display: flex; flex-direction: column; gap: 8px; }
        .rf-row { display: flex; align-items: center; gap: 8px; }
        .rf-time { width: 130px; padding: 10px 12px; border-radius: 8px; background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.08); color: var(--text-primary); font-family: var(--font-mono); font-size: 13px; }
        .rf-remove { display:inline-flex; align-items:center; justify-content:center; width: 30px; height: 30px; border-radius: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: var(--text-tertiary); cursor: pointer; -webkit-tap-highlight-color: transparent; transition: color 140ms, border-color 140ms; }
        .rf-remove:hover { color: var(--danger); border-color: rgba(255,107,107,0.3); }
        .rf-add { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; background: transparent; border: 1px dashed rgba(255,255,255,0.14); color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; -webkit-tap-highlight-color: transparent; align-self: flex-start; }
        .rf-add:hover { color: var(--text-primary); border-color: rgba(255,255,255,0.25); }
        .rf-add:disabled { opacity: 0.35; cursor: default; }
        .rf-hint { margin-top: 6px; font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary); letter-spacing: 0.04em; }
      `}</style>

      <div className="form-label rf-label">Reminders</div>
      <div className="rf-rows">
        {times.length === 0 && (
          <div className="rf-row">
            <button className="rf-add" onClick={addEmpty}>
              <Plus size={11} strokeWidth={2} /> Add reminder time
            </button>
          </div>
        )}
        {times.map((t, i) => (
          <div key={i} className="rf-row">
            <input
              type="time"
              className="rf-time"
              value={t}
              onChange={e => setAt(i, e.target.value)}
            />
            <button
              type="button"
              className="rf-remove"
              onClick={() => removeAt(i)}
              aria-label="Remove reminder"
              title="Remove"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
            {i === times.length - 1 && canAdd && (
              <button className="rf-add" onClick={addEmpty}>
                <Plus size={11} strokeWidth={2} /> Add
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="rf-hint">
        {times.length === 0
          ? 'optional · push when the time arrives'
          : goalValue > 1
            ? `${times.length} of up to ${max} reminders (matches goal of ${max}/day)`
            : 'will push at this time on scheduled days'}
      </div>
    </div>
  );
}
