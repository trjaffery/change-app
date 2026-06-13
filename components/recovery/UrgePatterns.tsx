'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react';

interface TagImpact { name: string; count: number; avg_intensity: number; delta_vs_overall: number }
interface HotTime { day: string; bucket: string; count: number }
interface DailyPoint { date: string; count: number }
interface Stats {
  totals: { urges: number; urges_last30: number };
  window: { last_count: number; prior_count: number; last_avg_intensity: number | null; prior_avg_intensity: number | null };
  overall_avg_intensity: number;
  tags_by_harm: TagImpact[];
  tags_by_frequency: TagImpact[];
  hot_times: HotTime[];
  daily_30d: DailyPoint[];
}

interface Observation { headline: string; detail: string; reference?: string }
interface PlanSuggestion { field: 'triggers' | 'warning_signs' | 'replacement_behaviors'; text: string }
interface Insights { observations: Observation[]; plan_suggestions: PlanSuggestion[] }
interface AICacheResponse { insights: Insights | null; generated_at: string | null; cached_urge_count: number; current_urge_count: number; stale: boolean }

function fmt(n: number | null, digits = 1): string {
  return n === null || Number.isNaN(n) ? '—' : n.toFixed(digits);
}

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

const PLAN_FIELD_LABEL: Record<PlanSuggestion['field'], string> = {
  triggers: 'Triggers',
  warning_signs: 'Warning signs',
  replacement_behaviors: 'Replacement behaviors',
};

export default function UrgePatterns({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Append text to a section of the RP plan. Reuses the existing PUT shape;
  // surfaces "Added" / "Already there" / "Failed" inline so the user has
  // closure without leaving the patterns card.
  const [appliedSuggestions, setAppliedSuggestions] = useState<Record<string, 'added' | 'duplicate' | 'failed'>>({});

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/recovery/patterns-stats');
    if (!res.ok) return;
    setStats(await res.json());
  }, []);

  // Single fetch that powers both the AI insights panel and the auto-regen
  // logic: if the cache is stale (new urges since it was generated), kick
  // off a background POST and swap in the fresh result when it lands.
  const refreshing = useRef(false);
  const loadAI = useCallback(async () => {
    const res = await fetch('/api/ai/recovery-patterns');
    if (!res.ok) return;
    const data = (await res.json()) as AICacheResponse;
    if (data.insights) setInsights(data.insights);
    if (data.generated_at) setGeneratedAt(data.generated_at);
    if (data.stale && !refreshing.current) {
      refreshing.current = true;
      setAiRefreshing(true);
      try {
        const regen = await fetch('/api/ai/recovery-patterns', { method: 'POST' });
        if (regen.ok) {
          const fresh = (await regen.json()) as Insights;
          setInsights(fresh);
          setGeneratedAt(new Date().toISOString());
        } else {
          const err = await regen.json().catch(() => ({}));
          setError(err.error ?? 'AI refresh failed');
        }
      } finally {
        setAiRefreshing(false);
        refreshing.current = false;
      }
    }
  }, []);

  useEffect(() => { loadStats(); loadAI(); }, [loadStats, loadAI, refreshKey]);

  async function applyPlanSuggestion(idx: number, s: PlanSuggestion) {
    setAppliedSuggestions(prev => ({ ...prev, [idx]: 'added' })); // optimistic
    try {
      const planRes = await fetch('/api/recovery/rp-plan');
      const plan = await planRes.json() as Record<string, string>;
      const current = plan[s.field] ?? '';
      if (current.toLowerCase().includes(s.text.toLowerCase().slice(0, 40))) {
        setAppliedSuggestions(prev => ({ ...prev, [idx]: 'duplicate' }));
        return;
      }
      const next = current ? `${current.replace(/\s+$/, '')}\n${s.text}` : s.text;
      const putRes = await fetch('/api/recovery/rp-plan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [s.field]: next }),
      });
      if (!putRes.ok) setAppliedSuggestions(prev => ({ ...prev, [idx]: 'failed' }));
    } catch {
      setAppliedSuggestions(prev => ({ ...prev, [idx]: 'failed' }));
    }
  }

  if (!stats) {
    return <div className="card" style={{ marginBottom: 22, minHeight: 240 }} />;
  }

  const { totals, window: w, tags_by_harm, tags_by_frequency, hot_times, daily_30d, overall_avg_intensity } = stats;
  const maxDaily = Math.max(...daily_30d.map(d => d.count), 1);
  const maxHarmAvg = Math.max(...tags_by_harm.map(t => t.avg_intensity), 1);
  const maxFreqCount = Math.max(...tags_by_frequency.map(t => t.count), 1);

  const countDelta = pctDelta(w.last_count, w.prior_count);
  const intensityDelta = pctDelta(w.last_avg_intensity, w.prior_avg_intensity);

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .up-section { margin-top: 18px; }
        .up-section:first-of-type { margin-top: 14px; }
        .up-label {
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 10px;
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }

        .up-shift-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .up-shift-cell {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 10px 12px;
        }
        .up-shift-name {
          font-family: var(--font-mono); font-size: 9px; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 6px;
        }
        .up-shift-value { font-size: 20px; font-weight: 800; color: var(--text-primary); line-height: 1; }
        .up-shift-prior { font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary); margin-top: 4px; }
        .up-shift-delta {
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          display: inline-flex; align-items: center; gap: 2px; margin-top: 4px;
        }
        .up-shift-delta.up { color: var(--danger); }
        .up-shift-delta.down { color: var(--success); }
        .up-shift-delta.flat { color: var(--text-tertiary); }
        .up-shift-delta.inv-up { color: var(--success); }
        .up-shift-delta.inv-down { color: var(--danger); }

        .up-bar-row {
          display: flex; align-items: center; gap: 10px;
          padding: 6px 0;
        }
        .up-bar-name { flex: 0 0 92px; font-size: 12px; color: var(--text-secondary); }
        .up-bar-track {
          flex: 1; height: 8px; background: rgba(255,255,255,0.04);
          border-radius: 4px; overflow: hidden;
        }
        .up-bar-fill { height: 100%; background: rgba(242,192,99,0.55); border-radius: 4px; transition: width 320ms cubic-bezier(0.22,1,0.36,1); }
        .up-bar-meta {
          flex: 0 0 auto; font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary); min-width: 76px; text-align: right;
        }
        .up-bar-meta .hi { color: var(--warning); font-weight: 700; }

        .up-hot-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .up-hot-pill {
          font-size: 11px; padding: 5px 10px; border-radius: 14px;
          background: rgba(242,192,99,0.1); border: 1px solid rgba(242,192,99,0.2);
          color: var(--text-secondary); display: inline-flex; gap: 6px; align-items: baseline;
        }
        .up-hot-pill .cnt {
          font-family: var(--font-mono); font-size: 10px; color: #F2C063; font-weight: 700;
        }

        .up-trend-row { display: flex; gap: 2px; align-items: flex-end; height: 44px; }
        .up-trend-bar { flex: 1; border-radius: 2px; align-self: flex-end; transition: height 320ms cubic-bezier(0.22,1,0.36,1); }
        .up-trend-axis { display: flex; justify-content: space-between; margin-top: 4px; font-size: 9px; color: var(--text-tertiary); font-family: var(--font-mono); }

        .up-ai-card {
          margin-top: 18px; padding: 14px;
          background: rgba(107,227,164,0.04);
          border: 1px solid rgba(107,227,164,0.16);
          border-radius: 12px;
        }
        .up-ai-head {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--success); margin-bottom: 12px;
        }
        .up-ai-head .meta {
          margin-left: auto; color: var(--text-tertiary);
          font-size: 9px; letter-spacing: 0.08em; font-weight: 600;
        }
        .up-ai-pulse {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--warning); display: inline-block;
          animation: up-pulse 1.2s ease-in-out infinite;
        }
        @keyframes up-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        .up-obs { padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.04); }
        .up-obs:first-of-type { border-top: none; padding-top: 0; }
        .up-obs-head { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; line-height: 1.35; }
        .up-obs-detail { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
        .up-obs-ref {
          font-family: var(--font-mono); font-size: 9px; color: var(--text-tertiary);
          margin-top: 4px; letter-spacing: 0.06em;
        }

        .up-suggest { margin-top: 10px; padding: 10px 12px;
          background: rgba(255,255,255,0.025); border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .up-suggest-field {
          font-family: var(--font-mono); font-size: 9px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 4px;
        }
        .up-suggest-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .up-suggest-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .up-suggest-btn {
          padding: 5px 10px; border-radius: 8px; cursor: pointer;
          background: rgba(107,227,164,0.12); border: 1px solid rgba(107,227,164,0.3);
          color: var(--success); font-family: var(--font-mono); font-size: 10px;
          font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          -webkit-tap-highlight-color: transparent;
        }
        .up-suggest-btn:hover { background: rgba(107,227,164,0.18); }
        .up-suggest-status { font-size: 10px; font-family: var(--font-mono); letter-spacing: 0.06em; color: var(--text-tertiary); }
        .up-suggest-status.added { color: var(--success); }
        .up-suggest-status.failed { color: var(--danger); }

        .up-empty { font-size: 12px; color: var(--text-tertiary); padding: 8px 0; line-height: 1.5; }
      `}</style>

      <div className="section-title">Urge Patterns</div>

      {/* ── 7-day shift ────────────────────────────────────────────────── */}
      <div className="up-section">
        <div className="up-label">Last 7 days <span>vs prior 7</span></div>
        <div className="up-shift-grid">
          <div className="up-shift-cell">
            <div className="up-shift-name">Urges</div>
            <div className="up-shift-value">{w.last_count}</div>
            <div className="up-shift-prior">prior {w.prior_count}</div>
            <DeltaBadge value={countDelta} invertColor />
          </div>
          <div className="up-shift-cell">
            <div className="up-shift-name">Avg intensity</div>
            <div className="up-shift-value">{fmt(w.last_avg_intensity, 1)}</div>
            <div className="up-shift-prior">prior {fmt(w.prior_avg_intensity, 1)}</div>
            <DeltaBadge value={intensityDelta} invertColor />
          </div>
        </div>
      </div>

      {/* ── Tags doing the most harm (avg intensity) ─────────────────── */}
      <div className="up-section">
        <div className="up-label">Worst by harm <span>{tags_by_harm.length ? `avg ${overall_avg_intensity.toFixed(1)} overall` : ''}</span></div>
        {tags_by_harm.length === 0 && (
          <div className="up-empty">Tag at least two urges with the same word to see which tags hit hardest.</div>
        )}
        {tags_by_harm.map((t, i) => (
          <div key={t.name} className="up-bar-row">
            <div className="up-bar-name">{t.name}</div>
            <div className="up-bar-track">
              <div className="up-bar-fill" style={{ width: `${(t.avg_intensity / maxHarmAvg) * 100}%`, background: i === 0 ? 'rgba(255,107,107,0.55)' : undefined }} />
            </div>
            <div className="up-bar-meta">
              {t.count}× · <span className={t.delta_vs_overall >= 0.4 ? 'hi' : ''}>avg {t.avg_intensity.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Most frequent tags (raw count, separate from harm) ────────── */}
      {tags_by_frequency.length > 0 && (
        <div className="up-section">
          <div className="up-label">Most logged</div>
          {tags_by_frequency.map(t => (
            <div key={t.name} className="up-bar-row">
              <div className="up-bar-name">{t.name}</div>
              <div className="up-bar-track">
                <div className="up-bar-fill" style={{ width: `${(t.count / maxFreqCount) * 100}%` }} />
              </div>
              <div className="up-bar-meta">{t.count}× · avg {t.avg_intensity.toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Hot times ─────────────────────────────────────────────────── */}
      {hot_times.length > 0 && (
        <div className="up-section">
          <div className="up-label">Hot windows</div>
          <div className="up-hot-row">
            {hot_times.map((h, i) => (
              <span key={i} className="up-hot-pill">
                {h.day} {h.bucket.toLowerCase()} <span className="cnt">×{h.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── 30-day sparkline ──────────────────────────────────────────── */}
      <div className="up-section">
        <div className="up-label">30-day trend <span>{totals.urges_last30} urges</span></div>
        <div className="up-trend-row">
          {daily_30d.map(d => (
            <div key={d.date} title={`${d.date}: ${d.count}`} className="up-trend-bar" style={{
              background: d.count > 0 ? 'rgba(242,192,99,0.5)' : 'rgba(255,255,255,0.04)',
              height: d.count > 0 ? Math.max(3, Math.round((d.count / maxDaily) * 40)) : 3,
            }} />
          ))}
        </div>
        <div className="up-trend-axis">
          <span>{daily_30d[0] ? new Date(daily_30d[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
          <span>Today</span>
        </div>
      </div>

      {/* ── AI insights ───────────────────────────────────────────────── */}
      <div className="up-ai-card">
        <div className="up-ai-head">
          <Sparkles size={11} strokeWidth={2} /> Insights
          <span className="meta">
            {aiRefreshing ? <><span className="up-ai-pulse" /> refreshing…</> : generatedAt ? `updated ${new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          </span>
        </div>
        {error && <div className="up-empty" style={{ color: 'var(--danger)' }}>{error}</div>}
        {!insights && !aiRefreshing && !error && <div className="up-empty">Generating your first analysis…</div>}
        {insights?.observations?.map((o, i) => (
          <div key={i} className="up-obs">
            <div className="up-obs-head">{o.headline}</div>
            <div className="up-obs-detail">{o.detail}</div>
            {o.reference && <div className="up-obs-ref">{o.reference}</div>}
          </div>
        ))}
        {insights?.plan_suggestions?.map((s, i) => {
          const status = appliedSuggestions[i];
          return (
            <div key={`s-${i}`} className="up-suggest">
              <div className="up-suggest-field">Add to · {PLAN_FIELD_LABEL[s.field]}</div>
              <div className="up-suggest-text">{s.text}</div>
              <div className="up-suggest-actions">
                {!status && (
                  <button className="up-suggest-btn" onClick={() => applyPlanSuggestion(i, s)}>+ Add</button>
                )}
                {status === 'added' && <span className="up-suggest-status added">added to plan</span>}
                {status === 'duplicate' && <span className="up-suggest-status">already in plan</span>}
                {status === 'failed' && <span className="up-suggest-status failed">failed — try again</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeltaBadge({ value, invertColor = false }: { value: number | null; invertColor?: boolean }) {
  if (value === null) return <div className="up-shift-delta flat">—</div>;
  const rounded = Math.round(value);
  if (Math.abs(rounded) < 1) {
    return <div className="up-shift-delta flat"><Minus size={10} strokeWidth={2.5} /> flat</div>;
  }
  // invertColor=true means "higher is worse" (urge count, intensity) — up = red.
  // invertColor=false means "higher is better" (surf count) — up = green.
  const isUp = rounded > 0;
  const cls = invertColor ? (isUp ? 'up' : 'down') : (isUp ? 'inv-up' : 'inv-down');
  const Arrow = isUp ? ArrowUp : ArrowDown;
  return <div className={`up-shift-delta ${cls}`}><Arrow size={10} strokeWidth={2.5} /> {Math.abs(rounded)}%</div>;
}
