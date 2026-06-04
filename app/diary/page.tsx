'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString, formatDate, toDateString } from '@/lib/dates';

interface Entry { date: string; body: string; mood: number | null; updated_at: string }

const INITIAL_PAST = 10;
const NEXT_PAGE = 20;
const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4']; // 1..5: red→amber→green

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + deltaDays);
  return toDateString(d);
}

function relativeSeconds(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DiaryPage() {
  const today = getActiveDateString();
  const [activeDate, setActiveDate] = useState(today);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const [tick, setTick] = useState(0); // forces "X seconds ago" re-render
  const [past, setPast] = useState<Entry[]>([]);
  const [pastTotal, setPastTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const initialLoadRef = useRef(true);

  // Load entry whenever activeDate changes.
  const loadEntry = useCallback(async (date: string) => {
    initialLoadRef.current = true;
    const res = await fetch(`/api/diary/${date}`);
    const data = (await res.json()) as Entry | null;
    setBody(data?.body ?? '');
    setMood(data?.mood ?? null);
    setSavedAt(data?.updated_at ?? null);
    dirtyRef.current = false;
    // After microtask so the textarea has the new content before we autosize.
    setTimeout(() => autosizeTextarea(), 0);
  }, []);

  useEffect(() => { loadEntry(activeDate); }, [activeDate, loadEntry]);

  // Past entries list.
  const loadPast = useCallback(async (size = INITIAL_PAST) => {
    const res = await fetch(`/api/diary?limit=${size}&offset=0`);
    const data = (await res.json()) as Entry[];
    setPast(Array.isArray(data) ? data : []);
    const total = res.headers.get('X-Total-Count');
    setPastTotal(total ? Number(total) : 0);
  }, []);
  useEffect(() => { loadPast(); }, [loadPast]);

  // "Saved Xs ago" ticker.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  function autosizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(240, el.scrollHeight)}px`;
  }

  // Debounced save — 1500ms after the user stops typing.
  const scheduleSave = useCallback((nextBody: string, nextMood: number | null) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setStatus('saving');
      try {
        const res = await fetch(`/api/diary/${activeDate}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: nextBody, mood: nextMood }),
        });
        const data = (await res.json()) as Entry;
        setSavedAt(data.updated_at);
        dirtyRef.current = false;
        // Refresh history list so today's entry preview stays current.
        loadPast(Math.max(INITIAL_PAST, past.length));
      } finally {
        setStatus('idle');
      }
    }, 1500);
  }, [activeDate, loadPast, past.length]);

  function onBodyChange(v: string) {
    setBody(v);
    autosizeTextarea();
    if (initialLoadRef.current) { initialLoadRef.current = false; return; }
    dirtyRef.current = true;
    scheduleSave(v, mood);
  }

  function onMoodChange(m: number | null) {
    setMood(m);
    if (initialLoadRef.current) { initialLoadRef.current = false; return; }
    dirtyRef.current = true;
    scheduleSave(body, m);
  }

  async function loadMorePast() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/diary?limit=${NEXT_PAGE}&offset=${past.length}`);
      const more = (await res.json()) as Entry[];
      if (Array.isArray(more) && more.length) setPast(prev => [...prev, ...more]);
      const total = res.headers.get('X-Total-Count');
      if (total) setPastTotal(Number(total));
    } finally {
      setLoadingMore(false);
    }
  }

  const isToday = activeDate === today;
  const isFuture = activeDate > today;

  // Suppress the unused-tick warning by referencing it in render.
  const savedLabel = savedAt ? `saved ${relativeSeconds(savedAt)}` : 'not yet saved';
  void tick;

  return (
    <>
      <style>{`
        .dr-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 8px; }
        .dr-arrow {
          width: 36px; height: 36px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent; color: var(--text-secondary);
          font-size: 16px; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          display: flex; align-items: center; justify-content: center;
          transition: background 160ms ease, color 160ms ease;
        }
        .dr-arrow:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }
        .dr-arrow:disabled { opacity: 0.3; cursor: default; }
        .dr-date {
          font-family: var(--font-mono);
          font-size: 13px; font-weight: 600;
          color: var(--text-primary);
          letter-spacing: 0.04em;
          text-align: center;
          flex: 1; min-width: 0;
        }
        .dr-today {
          font-family: var(--font-mono); font-size: 9px;
          color: var(--success); letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-left: 8px;
        }
        .dr-mood-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .dr-mood-label {
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.12em; text-transform: uppercase;
        }
        .dr-mood-pill {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-tertiary);
          font-family: var(--font-mono); font-weight: 700; font-size: 14px;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: all 160ms ease;
        }
        .dr-textarea {
          width: 100%;
          min-height: 240px;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-family: var(--font-serif);
          font-size: 17px;
          line-height: 1.6;
          padding: 18px 4px;
          resize: none;
          -webkit-tap-highlight-color: transparent;
        }
        .dr-textarea::placeholder { color: var(--text-tertiary); font-style: italic; }
        .dr-status {
          display: flex; align-items: center; justify-content: space-between;
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
          padding-top: 12px; margin-bottom: 22px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .dr-status-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          margin-right: 8px;
          background: var(--text-tertiary);
        }
        .dr-status-dot.saving {
          background: var(--warning);
          animation: dr-pulse 1.2s ease-in-out infinite;
        }
        @keyframes dr-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

        .dr-past-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 4px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          cursor: pointer;
          transition: background 140ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .dr-past-row:hover { background: rgba(255,255,255,0.025); }
        .dr-past-row.active { background: rgba(107,227,164,0.06); }
        .dr-past-date {
          font-family: var(--font-mono); font-size: 11px; font-weight: 600;
          color: var(--text-secondary);
          width: 64px; flex-shrink: 0;
          letter-spacing: 0.04em;
        }
        .dr-past-preview {
          font-size: 13px; color: var(--text-secondary);
          flex: 1; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          line-height: 1.4;
        }
        .dr-past-mood {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
      `}</style>

      <h1 className="page-title">Diary</h1>

      {/* Date navigation */}
      <div className="dr-nav">
        <button
          className="dr-arrow"
          onClick={() => setActiveDate(d => shiftDate(d, -1))}
          aria-label="Previous day"
        >‹</button>
        <div className="dr-date">
          {formatDate(activeDate)}
          {isToday && <span className="dr-today">Today</span>}
        </div>
        <button
          className="dr-arrow"
          onClick={() => !isFuture && setActiveDate(d => shiftDate(d, 1))}
          disabled={isToday}
          aria-label="Next day"
        >›</button>
        {!isToday && (
          <button
            className="dr-arrow"
            style={{ width: 'auto', padding: '0 14px', fontSize: 12 }}
            onClick={() => setActiveDate(today)}
          >Today</button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        {/* Mood */}
        <div className="dr-mood-row">
          <span className="dr-mood-label">Mood</span>
          {[1, 2, 3, 4, 5].map(n => {
            const isSel = mood === n;
            const tone = MOOD_TONES[n - 1];
            return (
              <button
                key={n}
                className="dr-mood-pill"
                onClick={() => onMoodChange(isSel ? null : n)}
                style={{
                  background: isSel ? `${tone}26` : 'rgba(255,255,255,0.04)',
                  borderColor: isSel ? `${tone}88` : 'rgba(255,255,255,0.08)',
                  color: isSel ? tone : 'var(--text-tertiary)',
                }}
                aria-label={`Mood ${n}`}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <textarea
          ref={textareaRef}
          className="dr-textarea"
          placeholder={isToday
            ? 'How did your day go? What stood out? Anything bothering you, anything you want to remember…'
            : 'No entry for this day. Write something to start.'}
          value={body}
          onChange={e => onBodyChange(e.target.value)}
          autoCapitalize="sentences"
          autoCorrect="on"
        />

        {/* Status */}
        <div className="dr-status">
          <span>
            <span className={`dr-status-dot${status === 'saving' ? ' saving' : ''}`} />
            {status === 'saving' ? 'saving…' : savedLabel}
          </span>
          <span>{body.length} chars</span>
        </div>
      </div>

      {/* History */}
      {past.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>Past entries</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
              {past.length} of {pastTotal}
            </span>
          </div>
          {past.map(e => {
            const isActive = e.date === activeDate;
            const moodColor = e.mood ? MOOD_TONES[e.mood - 1] : 'rgba(255,255,255,0.12)';
            const previewText = (e.body || '').replace(/\s+/g, ' ').trim() || '(empty)';
            return (
              <div
                key={e.date}
                className={`dr-past-row${isActive ? ' active' : ''}`}
                onClick={() => setActiveDate(e.date)}
              >
                <span className="dr-past-date">{formatDate(e.date)}</span>
                <span className="dr-past-mood" style={{ background: moodColor }} />
                <span className="dr-past-preview">{previewText}</span>
              </div>
            );
          })}
          {past.length < pastTotal && (
            <button
              onClick={loadMorePast}
              disabled={loadingMore}
              style={{
                marginTop: 10, width: '100%',
                padding: '9px 12px',
                border: '1px dashed rgba(255,255,255,0.12)',
                borderRadius: 10,
                background: 'transparent',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: loadingMore ? 'default' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {loadingMore ? 'Loading…' : `Load ${Math.min(NEXT_PAGE, pastTotal - past.length)} more`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
