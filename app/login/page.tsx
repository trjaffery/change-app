'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        setError('Invalid token. Try again.');
      }
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
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
          {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
          <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Checking…' : 'Enter →'}
          </button>
        </form>
      </div>
    </div>
  );
}
