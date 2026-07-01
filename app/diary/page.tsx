'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString, formatDate, toDateString } from '@/lib/dates';
import SavedLabel from '@/components/diary/SavedLabel';
import DiaryHeader from '@/components/diary/DiaryHeader';
import MoodChart from '@/components/diary/MoodChart';
import PastEntries from '@/components/diary/PastEntries';
import PageHeader from '@/components/layout/PageHeader';

interface Entry { date: string; body: string; mood: number | null; updated_at: string }

const INITIAL_PAST = 30; // pull enough at first to power the 30-day mood chart + 60-day heatmap
const NEXT_PAGE = 20;
const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4'];
// Phase 2 #10: small intuition cue alongside the color tone. The app generally
// avoids emoji, but at the extremes (1/5 = rough day, 5/5 = great day) a tiny
// face beats a color you might not register at a glance.
const MOOD_LABELS = ['rough', 'low', 'okay', 'good', 'great'] as const;

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + deltaDays);
  return toDateString(d);
}

export default function DiaryPage() {
  const today = getActiveDateString();
  const [activeDate, setActiveDate] = useState(today);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [past, setPast] = useState<Entry[]>([]);
  const [pastTotal, setPastTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reflection, setReflection] = useState<string | null>(null);
  const [reflectLoading, setReflectLoading] = useState(false);
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;

  // Load a single entry for the given date.
  const loadEntry = useCallback(async (date: string) => {
    const res = await fetch(`/api/diary/${date}`);
    const data = (await res.json()) as Entry | null;
    setBody(data?.body ?? '');
    setMood(data?.mood ?? null);
    setSavedAt(data?.updated_at ?? null);
    setReflection(null);
    // Autosize once after the new content lands. Done as a one-off here; the
    // typing path uses a grow-only debounced version below.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.max(240, el.scrollHeight)}px`;
    });
  }, []);
  useEffect(() => { loadEntry(activeDate); }, [activeDate, loadEntry]);

  // Past entries — fetched ONCE on mount and after explicit "Load more".
  // We do NOT refetch on save anymore; the freshly-saved entry is merged
  // optimistically into the local `past` array, which prevents the layout
  // shift that was causing iOS Safari to scroll-to-top mid-typing.
  const loadPast = useCallback(async (size: number) => {
    const res = await fetch(`/api/diary?limit=${size}&offset=0`);
    const data = (await res.json()) as Entry[];
    setPast(Array.isArray(data) ? data : []);
    const total = res.headers.get('X-Total-Count');
    setPastTotal(total ? Number(total) : 0);
  }, []);
  useEffect(() => { loadPast(INITIAL_PAST); }, [loadPast]);

  // Merge a freshly-saved entry into local state without refetching.
  function mergeSavedEntry(saved: Entry) {
    setPast(prev => {
      const existing = prev.findIndex(e => e.date === saved.date);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = saved;
        return next;
      }
      // New entry — insert in date order (newest first).
      const next = [...prev, saved].sort((a, b) => b.date.localeCompare(a.date));
      return next;
    });
    setPastTotal(prev => {
      // If we just added a brand-new date, bump the total.
      const inList = past.find(e => e.date === saved.date);
      return inList ? prev : prev + 1;
    });
  }

  // Grow-only autosize, debounced so it doesn't fire on every keystroke.
  // Skipping the `height: 'auto'` collapse step keeps the textarea from
  // visually wobbling mid-type — the page just grows downward as needed.
  function scheduleAutosize() {
    if (autosizeTimerRef.current) clearTimeout(autosizeTimerRef.current);
    autosizeTimerRef.current = setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      // Grow-only: if current pixel height already covers scrollHeight, do nothing.
      const current = el.offsetHeight;
      if (el.scrollHeight > current) {
        el.style.height = `${el.scrollHeight}px`;
      }
    }, 120);
  }

  // Debounced save — 1500ms after the user stops typing.
  const scheduleSave = useCallback((nextBody: string, nextMood: number | null) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/diary/${activeDate}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: nextBody, mood: nextMood }),
        });
        const data = (await res.json()) as Entry;
        setSavedAt(data.updated_at);
        mergeSavedEntry(data);
      } finally {
        setSaving(false);
      }
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);

  function onBodyChange(v: string) {
    setBody(v);
    scheduleAutosize();
    scheduleSave(v, mood);
  }

  function onMoodChange(m: number | null) {
    setMood(m);
    scheduleSave(body, m);
  }

  async function getReflection() {
    if (reflectLoading || wordCount < 40) return;
    setReflectLoading(true);
    setReflection(null);
    try {
      const res = await fetch('/api/ai/diary-reflect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: activeDate, body, mood }),
      });
      const data = await res.json() as { question?: string | null };
      if (data.question) setReflection(data.question);
    } catch { /* silent */ }
    finally { setReflectLoading(false); }
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
      `}</style>

      <PageHeader title="Diary" accent="diary" />

      <DiaryHeader entries={past} today={today} todayBody={isToday ? body : ''} total={pastTotal} />

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
          onClick={() => activeDate < today && setActiveDate(d => shiftDate(d, 1))}
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
            const label = MOOD_LABELS[n - 1];
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
                aria-label={`Mood ${n} — ${label}`}
                title={label}
              >
                {n}
              </button>
            );
          })}
        </div>

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

        <div className="dr-status">
          <SavedLabel updatedAt={savedAt} saving={saving} />
          <span>{body.length} chars</span>
          {isToday && wordCount >= 40 && (
            <button
              onClick={getReflection}
              disabled={reflectLoading}
              style={{
                marginLeft: 'auto',
                padding: '4px 10px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: reflectLoading ? 'default' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {reflectLoading ? 'thinking…' : reflection ? '↺ another' : 'ask a question'}
            </button>
          )}
        </div>
        {reflection && (
          <div style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'rgba(120,180,255,0.04)',
            borderLeft: '2px solid #78B4FF',
            borderRadius: 10,
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <span style={{ flex: 1 }}>{reflection}</span>
            <button
              onClick={() => {
                const sep = body.endsWith('\n') || body.length === 0 ? '' : '\n\n';
                const next = body + sep + reflection + '\n';
                setBody(next);
                scheduleSave(next, mood);
                setReflection(null);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              style={{
                background: 'transparent',
                border: '1px solid rgba(120,180,255,0.3)',
                borderRadius: 8,
                padding: '4px 10px',
                color: '#78B4FF',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontStyle: 'normal',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
              }}
            >
              + append
            </button>
          </div>
        )}
      </div>

      <MoodChart entries={past} />

      <PastEntries
        entries={past}
        total={pastTotal}
        activeDate={activeDate}
        today={today}
        loadingMore={loadingMore}
        onLoadMore={loadMorePast}
        onEdit={(date) => {
          setActiveDate(date);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </>
  );
}
