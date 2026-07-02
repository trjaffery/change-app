'use client';

interface Entry { date: string; mood: number | null }

const MOOD_TONES = ['#FF6B6B', '#E07658', '#F2C063', '#9BD56F', '#6BE3A4'];

/**
 * 30-day mood line chart. Visual language matches BodyWeightCard's WeightChart.
 * Hidden when fewer than 3 mood-tagged entries are available (avoids a
 * near-empty chart that conveys nothing).
 */
export default function MoodChart({ entries }: { entries: Entry[] }) {
  // Last 30 days, oldest first
  const today = new Date();
  const days: { date: string; mood: number | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const match = entries.find(e => e.date === iso);
    days.push({ date: iso, mood: match?.mood ?? null });
  }

  const moodCount = days.filter(d => d.mood !== null).length;
  if (moodCount < 3) return null;

  const W = 600, H = 110, PX = 12, PT = 10, PB = 22;
  const innerW = W - PX * 2;
  const innerH = H - PT - PB;

  // Y-axis: mood 1-5 → top=5, bottom=1
  const yFor = (m: number) => PT + innerH - ((m - 1) / 4) * innerH;
  const xFor = (i: number) => PX + (i / (days.length - 1)) * innerW;

  // Build polyline only from days with a mood; segments split at gaps.
  const segments: string[] = [];
  let current: string[] = [];
  days.forEach((d, i) => {
    if (d.mood !== null) {
      current.push(`${xFor(i)},${yFor(d.mood)}`);
    } else if (current.length) {
      segments.push(current.join(' '));
      current = [];
    }
  });
  if (current.length) segments.push(current.join(' '));

  // Mean of mood-tagged days for the dashed avg line
  const avg = days.filter(d => d.mood !== null).reduce((s, d) => s + (d.mood ?? 0), 0) / moodCount;
  const avgY = yFor(avg);

  const fmtTick = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tickIdx = [0, Math.round((days.length - 1) / 3), Math.round((2 * (days.length - 1)) / 3), days.length - 1];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-title">Mood · last 30 days</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <filter id="mc-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* horizontal grid at 1/3/5 */}
        {[1, 3, 5].map(m => (
          <line key={m} x1={PX} y1={yFor(m)} x2={PX + innerW} y2={yFor(m)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ))}

        {/* dashed average line */}
        <line x1={PX} y1={avgY} x2={PX + innerW} y2={avgY}
          stroke="rgba(180,180,200,0.4)" strokeWidth={1.2} strokeDasharray="4 3" />
        <text x={PX + innerW - 4} y={avgY - 4} textAnchor="end" fontSize={8} fontFamily="monospace" fill="rgba(180,180,200,0.55)">
          avg {avg.toFixed(1)}
        </text>

        {/* connecting line segments */}
        {segments.map((s, i) => (
          <polyline key={i} points={s} fill="none" stroke="rgba(180,180,200,0.55)" strokeWidth={1.4}
            strokeLinecap="round" strokeLinejoin="round" filter="url(#mc-glow)" vectorEffect="non-scaling-stroke" />
        ))}

        {/* per-day dots, colored by mood */}
        {days.map((d, i) => {
          if (d.mood === null) return null;
          const isLast = i === days.length - 1;
          return (
            <circle
              key={d.date}
              cx={xFor(i)} cy={yFor(d.mood)}
              r={isLast ? 4 : 2.5}
              fill={MOOD_TONES[d.mood - 1]}
              stroke={isLast ? '#FFFFFF' : 'transparent'}
              strokeWidth={isLast ? 1.5 : 0}
              filter="url(#mc-glow)"
            />
          );
        })}

        {/* x-axis tick dates */}
        {tickIdx.map(i => (
          <text key={i} x={xFor(i)} y={H - 6} fontSize={9} fontFamily="monospace" fill="rgba(255,255,255,0.3)" textAnchor="middle">
            {fmtTick(days[i].date)}
          </text>
        ))}

        {/* y-axis range labels */}
        <text x={PX} y={yFor(5) - 2} fontSize={9} fontFamily="monospace" fill="rgba(255,255,255,0.3)">5</text>
        <text x={PX} y={yFor(1) + 10} fontSize={9} fontFamily="monospace" fill="rgba(255,255,255,0.3)">1</text>
      </svg>
    </div>
  );
}
