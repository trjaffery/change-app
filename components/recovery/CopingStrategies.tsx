const STRATEGIES = [
  { icon: '💪', title: 'Exercise', desc: '10 minutes of movement shifts brain chemistry and kills cravings fast.' },
  { icon: '🚿', title: 'Cold Shower', desc: '2 minutes cold resets the nervous system and stops the spiral.' },
  { icon: '🧊', title: 'Ice Dive', desc: 'Hold ice cubes for 60 seconds — grounds you completely in the present.' },
  { icon: '📞', title: 'Call Someone', desc: 'Connection is the antidote to addiction. Call any safe person now.' },
  { icon: '🍵', title: 'Tea Ritual', desc: 'Make a hot drink slowly and deliberately. The ritual is the point.' },
  { icon: '📓', title: 'Journal', desc: 'Write the urge out fully — getting it out of your head diminishes it.' },
  { icon: '🧘', title: 'Box Breathing', desc: '4 in, hold 4, out 4, hold 4. Repeat 4 times. Activates the vagus nerve.' },
  { icon: '🎮', title: 'Engage Hands', desc: 'Puzzle, game, cook, clean — occupying the hands quiets the mind.' },
];

export default function CopingStrategies() {
  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Coping Strategies</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        {STRATEGIES.map(s => (
          <div key={s.title} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
