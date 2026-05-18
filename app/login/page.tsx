'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [token, setToken] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = `/?token=${encodeURIComponent(token)}`;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, background: 'linear-gradient(180deg,#fff,#C7C4BC)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Change
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>Enter your access token to continue.</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="text-input"
            type="password"
            placeholder="Access token"
            value={token}
            onChange={e => setToken(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
          />
          <button className="btn-primary" type="submit" style={{ width: '100%' }}>Enter →</button>
        </form>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 14 }}>
          Or visit <code style={{ fontSize: 11 }}>?token=your-token</code> directly.
        </div>
      </div>
    </div>
  );
}
