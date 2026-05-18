'use client';
import { useEffect, useState } from 'react';

interface Urge { created_at: string }
const BUCKETS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;

function getHourBucket(ts: string): typeof BUCKETS[number] {
  const h = new Date(ts).getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

export default function UrgePatterns({ refreshKey }: { refreshKey: number }) {
  const [counts, setCounts] = useState<Record<string, number>>({ Morning: 0, Afternoon: 0, Evening: 0, Night: 0 });

  useEffect(() => {
    fetch('/api/recovery/urges').then(r => r.json()).then((urges: Urge[]) => {
      const c = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
      for (const u of urges) c[getHourBucket(u.created_at)]++;
      setCounts(c);
    });
  }, [refreshKey]);

  const maxCount = Math.max(...Object.values(counts), 1);
  const MAX_H = 60;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Urge Patterns</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 90 }}>
        {BUCKETS.map(b => (
          <div key={b} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{counts[b]}</div>
            <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'rgba(242,192,99,0.45)', height: Math.max(4, Math.round((counts[b] / maxCount) * MAX_H)), transition: 'height 0.4s cubic-bezier(0.22,1,0.36,1)' }} />
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
