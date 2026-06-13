'use client';
import { useState } from 'react';
import { FastForward } from 'lucide-react';
import Markdown from '@/components/coach/Markdown';

/**
 * The "play the tape through" CBT exercise. User types what they're tempted
 * to do; AI walks through the realistic next 24 hours so the moment-craving
 * meets the morning-after consequence.
 */
export default function PlayTheTape() {
  const [situation, setSituation] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!situation.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch('/api/ai/play-the-tape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else if (data.message) {
        setResponse(data.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="play-the-tape-card" className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Play it forward</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.55 }}>
        Type the moment you&apos;re tempted by. The coach walks through the realistic next 24 hours — so the craving meets the morning after.
      </div>
      <textarea
        value={situation}
        onChange={e => setSituation(e.target.value)}
        placeholder="e.g. it's late, I'm alone, I want to open my laptop and just check…"
        rows={3}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          lineHeight: 1.55,
          outline: 'none',
          resize: 'vertical',
          marginBottom: 10,
        }}
        autoCapitalize="sentences"
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-primary"
          style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={go}
          disabled={loading || !situation.trim()}
        >
          <FastForward size={14} strokeWidth={1.75} />
          {loading ? 'Thinking…' : 'Play it forward'}
        </button>
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)' }}>Error: {error}</div>}

      {response && (
        <div style={{
          marginTop: 14,
          padding: '14px 16px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          <Markdown text={response} />
        </div>
      )}
    </div>
  );
}
