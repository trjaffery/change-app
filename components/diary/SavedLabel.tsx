'use client';
import { useEffect, useState } from 'react';

/**
 * Tiny self-ticking "saved Xs ago" label.
 *
 * Lives in its own component so its 10s interval doesn't re-render the
 * editor / past list above it — which on iPhone Safari + open keyboard
 * was causing scroll-to-top glitches mid-typing.
 */

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

export default function SavedLabel({ updatedAt, saving }: { updatedAt: string | null; saving: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <span>
      <span className={`dr-status-dot${saving ? ' saving' : ''}`} />
      {saving
        ? 'saving…'
        : updatedAt
        ? `saved ${relativeSeconds(updatedAt)}`
        : 'not yet saved'}
    </span>
  );
}
