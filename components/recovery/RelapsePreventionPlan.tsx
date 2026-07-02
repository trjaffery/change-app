'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Plan {
  triggers: string;
  warning_signs: string;
  replacement_behaviors: string;
  why: string;
  updated_at?: string;
}

export default function RelapsePreventionPlan() {
  const [plan, setPlan] = useState<Plan>({ triggers: '', warning_signs: '', replacement_behaviors: '', why: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recovery/rp-plan');
      const data = (await res.json()) as Plan;
      setPlan({
        triggers: data.triggers ?? '',
        warning_signs: data.warning_signs ?? '',
        replacement_behaviors: data.replacement_behaviors ?? '',
        why: data.why ?? '',
      });
      setSavedAt(data.updated_at ?? null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Debounced save, 1.5s. Same pattern as diary.
  const scheduleSave = useCallback((next: Plan) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch('/api/recovery/rp-plan', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        const data = (await res.json()) as Plan;
        setSavedAt(data.updated_at ?? new Date().toISOString());
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, []);

  function update<K extends keyof Plan>(key: K, value: Plan[K]) {
    const next = { ...plan, [key]: value };
    setPlan(next);
    scheduleSave(next);
  }

  if (loading) return <div className="card" style={{ marginBottom: 22, minHeight: 120 }} />;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .rp-section { margin-bottom: 18px; }
        .rp-section:last-of-type { margin-bottom: 0; }
        .rp-label {
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-tertiary);
          margin-bottom: 8px;
        }
        .rp-textarea {
          width: 100%;
          min-height: 80px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 16px;
          line-height: 1.55;
          outline: none;
          resize: vertical;
          transition: border-color 160ms ease;
        }
        .rp-textarea:focus { border-color: rgba(107,227,164,0.32); }
        .rp-textarea::placeholder { color: var(--text-tertiary); }

        .rp-why {
          font-family: var(--font-sans);
          font-style: italic;
          font-size: 17px;
          min-height: 60px;
        }

        .rp-footer {
          display: flex; align-items: center; gap: 6px;
          margin-top: 18px; padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary);
        }
        .rp-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: var(--text-tertiary);
        }
        .rp-dot.saving { background: var(--warning); animation: rp-pulse 1.2s ease-in-out infinite; }
        @keyframes rp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>

      <div className="section-title">Relapse prevention plan</div>

      <div className="rp-section">
        <div className="rp-label">My triggers</div>
        <textarea
          className="rp-textarea"
          placeholder="Specific situations, times, people, apps, places that put me at risk…"
          value={plan.triggers}
          onChange={e => update('triggers', e.target.value)}
        />
      </div>

      <div className="rp-section">
        <div className="rp-label">Warning signs</div>
        <textarea
          className="rp-textarea"
          placeholder="The thoughts, feelings, behaviors I notice before a slip (e.g. isolating, doom-scrolling)…"
          value={plan.warning_signs}
          onChange={e => update('warning_signs', e.target.value)}
        />
      </div>

      <div className="rp-section">
        <div className="rp-label">Replacement behaviors</div>
        <textarea
          className="rp-textarea"
          placeholder="What I will do INSTEAD when a trigger hits. Be specific (call X, walk outside, do Y)…"
          value={plan.replacement_behaviors}
          onChange={e => update('replacement_behaviors', e.target.value)}
        />
      </div>

      <div className="rp-section">
        <div className="rp-label">My &quot;why&quot;</div>
        <textarea
          className="rp-textarea rp-why"
          placeholder="Why I'm doing this. The person I want to be. What I lose if I don't."
          value={plan.why}
          onChange={e => update('why', e.target.value)}
        />
      </div>

      <div className="rp-footer">
        <span className={`rp-dot${saving ? ' saving' : ''}`} />
        <span>{saving ? 'saving…' : savedAt ? `last saved ${new Date(savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'not yet saved'}</span>
      </div>
    </div>
  );
}
