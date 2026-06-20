'use client';
import { useState } from 'react';
import { FastForward, Copy, NotebookPen, RotateCcw } from 'lucide-react';
import Markdown from '@/components/coach/Markdown';
import { getActiveDateString } from '@/lib/dates';
import { useToast } from '@/components/layout/Toast';

/**
 * The "play the tape through" CBT exercise. User types what they're tempted
 * to do; AI walks through the realistic next 24 hours so the moment-craving
 * meets the morning-after consequence.
 */
export default function PlayTheTape() {
  const toast = useToast();
  const [situation, setSituation] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToDiary, setSavedToDiary] = useState(false);

  async function copyResponse() {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      toast({ kind: 'success', message: 'Copied to clipboard' });
    } catch {
      toast({ kind: 'error', message: "Couldn't copy" });
    }
  }

  async function saveToDiary() {
    if (!response || savedToDiary) return;
    const today = getActiveDateString();
    try {
      // Append the AI response to today's diary entry. Fetch first so we
      // preserve whatever's already there.
      const existing = await fetch(`/api/diary/${today}`).then(r => r.json()).catch(() => null);
      const prev = (existing?.body ?? '').trim();
      const stamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const block = `\n\n— Played the tape (${stamp}) —\nSituation: ${situation.trim()}\n\n${response}\n`;
      const next = prev ? prev + block : block.trimStart();
      const res = await fetch(`/api/diary/${today}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: next, mood: existing?.mood ?? null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedToDiary(true);
      toast({ kind: 'success', message: 'Saved to today\'s diary' });
    } catch {
      toast({ kind: 'error', message: "Couldn't save to diary" });
    }
  }

  function clearAll() {
    setSituation('');
    setResponse(null);
    setError(null);
    setSavedToDiary(false);
  }

  async function go() {
    if (!situation.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      // Capture local time so the AI can name actual clock hours in the
      // playback (the server may run in a different timezone, so we hand it
      // a pre-formatted label plus the raw local hour).
      const now = new Date();
      const now_label = `${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      const res = await fetch('/api/ai/play-the-tape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation, now_label, hour_now: now.getHours() }),
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
        <>
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
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={copyResponse}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11,
                letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Copy size={11} strokeWidth={2} /> Copy
            </button>
            <button
              onClick={saveToDiary}
              disabled={savedToDiary}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8,
                background: savedToDiary ? 'rgba(107,227,164,0.1)' : 'transparent',
                border: `1px solid ${savedToDiary ? 'rgba(107,227,164,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: savedToDiary ? 'var(--success)' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: savedToDiary ? 'default' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <NotebookPen size={11} strokeWidth={2} /> {savedToDiary ? 'Saved' : 'Save to diary'}
            </button>
            <button
              onClick={clearAll}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11,
                letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <RotateCcw size={11} strokeWidth={2} /> Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}
