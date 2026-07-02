'use client';
import { useMemo, useRef, useState } from 'react';
import { formatDate } from '@/lib/dates';
import Markdown from '@/components/coach/Markdown';
import MoodHeatmap from '@/components/diary/MoodHeatmap';

interface Entry { date: string; body: string; mood: number | null; updated_at?: string }

const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4'];

function wordCount(s: string): number {
  const t = s?.trim() ?? '';
  if (!t) return 0;
  return t.split(/\s+/).length;
}

// Wrap matches of `query` in <mark>. Case-insensitive. Escapes regex specials.
function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(re);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <mark key={i} style={{ background: 'rgba(107,227,164,0.22)', color: 'inherit', padding: 0, borderRadius: 2 }}>{p}</mark>
      : p,
  );
}

export default function PastEntries({
  entries,
  total,
  activeDate,
  today,
  loadingMore,
  onLoadMore,
  onEdit,
}: {
  entries: Entry[];
  total: number;
  activeDate: string;
  today: string;
  loadingMore: boolean;
  onLoadMore: () => void;
  onEdit: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Client-side filter — case-insensitive substring across body.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => (e.body ?? '').toLowerCase().includes(q));
  }, [entries, query]);

  function jumpToDate(date: string) {
    // Heatmap → expand + scroll into view
    setQuery('');
    setExpanded(date);
    requestAnimationFrame(() => {
      const el = rowRefs.current.get(date);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  if (entries.length === 0) return null;

  return (
    <div className="card">
      <style>{`
        .pe-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
        .pe-search {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 9px 12px;
          color: var(--text-primary);
          font-family: var(--font-sans);
          /* 16px to prevent iOS focus zoom */
          font-size: 16px;
          outline: none;
          margin-bottom: 12px;
          -webkit-appearance: none;
        }
        .pe-search:focus { border-color: rgba(107,227,164,0.32); }
        .pe-search::placeholder { color: var(--text-tertiary); }

        .pe-row {
          padding: 12px 4px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          cursor: pointer;
          transition: background 140ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .pe-row:last-of-type { border-bottom: none; }
        .pe-row:hover { background: rgba(255,255,255,0.025); }
        .pe-row.active { background: rgba(107,227,164,0.06); }

        .pe-row-head { display: flex; align-items: center; gap: 10px; }
        .pe-date {
          font-family: var(--font-mono); font-size: 11px; font-weight: 600;
          color: var(--text-secondary);
          width: 84px; flex-shrink: 0;
          letter-spacing: 0.04em;
        }
        .pe-mood-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .pe-meta {
          font-family: var(--font-mono); font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.04em;
          margin-left: auto;
          flex-shrink: 0;
        }
        .pe-caret {
          color: var(--text-tertiary);
          font-size: 10px;
          flex-shrink: 0;
          transition: transform 200ms ease;
        }
        .pe-caret.open { transform: rotate(180deg); }

        .pe-preview {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.45;
          margin-top: 6px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .pe-expanded {
          margin-top: 10px;
          padding: 12px 14px;
          background: rgba(255,255,255,0.025);
          border-radius: 10px;
          font-family: var(--font-sans);
          font-size: 15px;
          line-height: 1.6;
          color: var(--text-primary);
        }
        .pe-expanded-foot {
          display: flex; justify-content: flex-end; margin-top: 12px;
        }
        .pe-edit {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
          padding: 6px 12px; border-radius: 8px;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .pe-edit:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); }
      `}</style>

      <div className="pe-head">
        <div className="section-title" style={{ margin: 0 }}>Past entries</div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
          {query ? `${filtered.length} of ${entries.length} match` : `${entries.length} of ${total}`}
        </span>
      </div>

      <MoodHeatmap entries={entries} today={today} onSelect={jumpToDate} />

      <input
        type="search"
        className="pe-search"
        placeholder="Search past entries…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {filtered.length === 0 && query.trim() && (
        <div className="empty-state">No entries match &quot;{query}&quot;</div>
      )}

      {filtered.map(e => {
        const isActive = e.date === activeDate;
        const isExpanded = expanded === e.date;
        const moodColor = e.mood ? MOOD_TONES[e.mood - 1] : 'rgba(255,255,255,0.18)';
        const wc = wordCount(e.body);
        const preview = (e.body || '').replace(/\s+/g, ' ').trim() || '(empty)';
        return (
          <div
            key={e.date}
            ref={el => { if (el) rowRefs.current.set(e.date, el); }}
            className={`pe-row${isActive ? ' active' : ''}`}
            onClick={() => setExpanded(isExpanded ? null : e.date)}
          >
            <div className="pe-row-head">
              <span className="pe-date">{formatDate(e.date)}</span>
              <span className="pe-mood-dot" style={{ background: moodColor }} />
              <span className="pe-meta">
                {wc} word{wc === 1 ? '' : 's'}{e.mood ? ` · ${e.mood}/5` : ''}
              </span>
              <span className={`pe-caret${isExpanded ? ' open' : ''}`}>▾</span>
            </div>
            {!isExpanded && (
              <div className="pe-preview">{highlight(preview, query)}</div>
            )}
            {isExpanded && (
              <div className="pe-expanded">
                {e.body?.trim() ? <Markdown text={e.body} /> : <em style={{ color: 'var(--text-tertiary)' }}>Empty entry</em>}
                <div className="pe-expanded-foot">
                  <button
                    className="pe-edit"
                    onClick={ev => { ev.stopPropagation(); onEdit(e.date); }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!query && entries.length < total && (
        <button
          onClick={onLoadMore}
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
          {loadingMore ? 'Loading…' : `Load 20 more`}
        </button>
      )}
    </div>
  );
}
