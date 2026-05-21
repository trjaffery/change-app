'use client';
import { useState } from 'react';

export default function CheckIn({ days }: { days: number }) {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  async function getCheckIn() {
    setLoading(true); setResponse('Getting your check-in…');
    try {
      const urgesRes = await fetch('/api/recovery/urges');
      const urges: { intensity: number; note: string }[] = await urgesRes.json();
      const recentUrges = urges.slice(0, 5);
      const res = await fetch('/api/ai/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, recentUrges }),
      });
      const data = await res.json();
      setResponse(data.message ?? (data.error === 'no_key' ? 'Add your Google API key to use AI check-ins.' : data.error ?? 'Something went wrong.'));
    } catch {
      setResponse('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">AI Check-in</div>
      <button className="btn-primary" style={{ padding: '10px 18px', fontSize: 13 }} onClick={getCheckIn} disabled={loading}>
        {loading ? '…' : '✨ Get encouragement'}
      </button>
      {response && <div className="ai-response" style={{ display: 'block' }}>{response}</div>}
    </div>
  );
}
